import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer', () => {
  let r;
  beforeEach(() => { r = new Renderer(); });

  it('parses frontmatter', () => {
    const { data, content } = r.parseFrontmatter('---\nt: H\n---\n# W');
    expect(data.t).toBe('H');
    expect(content.trim()).toBe('# W');
  });

  it('renders markdown to HTML', async () => {
    const html = await r.renderHtml('# H');
    expect(html).toContain('id="h">H</h1>');
  });

  it('uses title from frontmatter', async () => {
    expect(await r.renderHtml('---\ntitle: T\n---\n# C')).toContain('<title>T</title>');
  });

  it('includes MathJax script', async () => {
    expect(await r.renderHtml('$E=mc^2$')).toContain('MathJax-script');
  });

  it('handles footnotes', async () => {
    expect(await r.renderHtml('F[^1]\n\n[^1]: C')).toContain('class="footnotes"');
  });

  it('highlights code', async () => {
    expect(await r.renderHtml('```js\nconst x = 1;\n```')).toContain('hljs language-js');
  });

  it('generates TOC', async () => {
    const html = await r.renderHtml('# H1\n## H2\n[TOC]');
    expect(html).toContain('class="toc"');
    expect(html).toContain('href="#h1"');
  });

  it('uses custom template', async () => {
    const html = await new Renderer({ template: resolve(__dirname, 'fixtures/template.html') }).renderHtml('# HT');
    expect(html).toContain('Markdown Document - <h1 id="ht">HT</h1>');
  });

  it('injects base tag', async () => {
    expect(await new Renderer({ basePath: '/p' }).renderHtml('# H')).toContain('<base href="file:///p/">');
  });

  it('handles malformed frontmatter', async () => {
    const html = await r.renderHtml('---\ni: [\n---\n# MC');
    expect(html).toContain('id="mc">MC</h1>');
  });

  it('handles TOC with no headings', async () => {
    expect(await r.renderHtml('T', { toc: true })).not.toContain('class="toc"');
  });

  it('renders complex nested lists', async () => {
    const html = await r.renderHtml('1. I1\n    - S1');
    expect(html).toContain('<ol>');
    expect(html).toContain('<ul>');
  });

  it('handles GFM task lists', async () => {
    expect(await r.renderHtml('- [x] T')).toContain('type="checkbox"');
  });

  it('handles tables with alignment', async () => {
    expect(await r.renderHtml('| L | R |\n|:-|-:|\n| 1 | 2 |')).toContain('align="left"');
  });
});
