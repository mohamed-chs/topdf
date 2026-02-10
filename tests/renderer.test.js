import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/renderer.js';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer', () => {
  const renderer = new Renderer();

  it('should parse frontmatter', () => {
    const md = `---
title: Hello
---
# World`;
    const { data, content } = renderer.parseFrontmatter(md);
    expect(data.title).toBe('Hello');
    expect(content.trim()).toBe('# World');
  });

  it('should render markdown to HTML', async () => {
    const md = '# Hello World';
    const html = await renderer.renderHtml(md);
    expect(html).toContain('id="hello-world">Hello World</h1>');
    expect(html).toContain('<title>Markdown Document</title>');
  });

  it('should use title from frontmatter', async () => {
    const md = `---
title: Custom Title
---
# Content`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('<title>Custom Title</title>');
  });

  it('should include MathJax script', async () => {
    const md = '$E=mc^2$';
    const html = await renderer.renderHtml(md);
    expect(html).toContain('MathJax-script');
    expect(html).toContain('window.MathJax');
  });

  it('should handle footnotes', async () => {
    const md = `Footnote[^1]

[^1]: Content`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('class="footnotes"');
  });

  it('should highlight code', async () => {
    const md = '```js\nconst x = 1;\n```';
    const html = await renderer.renderHtml(md);
    expect(html).toContain('hljs language-js');
  });

  it('should generate TOC', async () => {
    const md = '# H1\n## H2\n[TOC]';
    const html = await renderer.renderHtml(md);
    expect(html).toContain('class="toc"');
    expect(html).toContain('href="#h1"');
    expect(html).toContain('href="#h2"');
  });

  it('should use custom template', async () => {
    const templatePath = resolve(__dirname, '../tests/fixtures/template.html');
    const rendererWithTemplate = new Renderer({
      template: templatePath
    });
    
    const md = '# Hello';
    const html = await rendererWithTemplate.renderHtml(md);
    expect(html).toContain('Markdown Document - <h1 id="hello">Hello</h1>');
  });
});