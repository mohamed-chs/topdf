import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer', () => {
  let r: Renderer;
  beforeEach(() => { r = new Renderer(); });

  it('parses frontmatter', () => {
    const { data, content } = r.parseFrontmatter('---\nt: H\n---\n# W');
    expect(data['t']).toBe('H');
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
    const html = await r.renderHtml('```js\nconst x = 1;\n```');
    expect(html).toContain('hljs language-js');
    // Verify actual syntax highlighting spans are produced (not just class names)
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  it('highlights code for multiple languages', async () => {
    const html = await r.renderHtml('```rust\nfn main() {\n    let x = 5;\n}\n```');
    expect(html).toContain('hljs language-rust');
    expect(html).toContain('<span class="hljs-keyword">fn</span>');
    expect(html).toContain('<span class="hljs-keyword">let</span>');
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

  it('preserves double backslashes in display math', async () => {
    const md = '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$';
    const html = await r.renderHtml(md);
    // Double backslashes must survive Marked processing (not become \<br>)
    expect(html).toContain('a &= b \\\\');
    expect(html).toContain('c &= d');
    // $$ delimiters must be preserved
    expect(html).toContain('$$');
  });

  it('preserves ampersands in display math', async () => {
    const md = '$$\nx &= y + z\n$$';
    const html = await r.renderHtml(md);
    // & must NOT be HTML-escaped to &amp; inside math
    expect(html).toContain('x &= y + z');
    expect(html).not.toContain('x &amp;= y + z');
  });

  it('does not mangle math inside code blocks', async () => {
    const md = '```tex\n$$\na &= b \\\\\n$$\n```';
    const html = await r.renderHtml(md);
    // Code blocks should still be processed normally (not treated as math)
    expect(html).toContain('hljs language-tex');
  });

  it('handles inline math alongside display math', async () => {
    const md = 'Inline $x^2$ and display:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$';
    const html = await r.renderHtml(md);
    expect(html).toContain('$x^2$');
    expect(html).toContain('$$');
    expect(html).toContain('\\sum_{i=1}^{n}');
  });
});