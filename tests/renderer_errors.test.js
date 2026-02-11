import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer.js';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer Error Handling & Edge Cases', () => {
  let renderer;
  beforeEach(() => {
    renderer = new Renderer();
  });

  it('should handle malformed frontmatter gracefully', async () => {
    const md = `---
invalid: [
---
# Content`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('id="content">Content</h1>');
  });

  it('should handle missing frontmatter', async () => {
    const md = '# Content';
    const { data, content } = renderer.parseFrontmatter(md);
    expect(data).toEqual({});
    expect(content).toBe('# Content');
  });

  it('should handle empty frontmatter', async () => {
    const md = `---\n\n---\n# Content`;
    const { data, content } = renderer.parseFrontmatter(md);
    expect(data).toEqual({});
    expect(content.trim()).toBe('# Content');
  });

  it('should fallback to default if custom template is missing', async () => {
    const rendererWithBadTemplate = new Renderer({
      template: '/non/existent/template.html'
    });
    const md = '# Hello';
    const html = await rendererWithBadTemplate.renderHtml(md);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
  });

  it('should fallback to default if custom CSS is missing', async () => {
    const rendererWithBadCss = new Renderer({
      customCss: '/non/existent/style.css'
    });
    const md = '# Hello';
    const html = await rendererWithBadCss.renderHtml(md);
    expect(html).toContain('<style>');
    expect(html).toContain('body');
  });

  it('should handle TOC generation with no headings', async () => {
    const md = 'Just some text, no headings.';
    const html = await renderer.renderHtml(md, { toc: true });
    expect(html).not.toContain('class="toc"');
  });

  it('should handle TOC generation with only one heading', async () => {
    const md = '# Heading 1\nJust some text.';
    const html = await renderer.renderHtml(md, { toc: true });
    expect(html).toContain('class="toc"');
    expect(html).toContain('href="#heading-1"');
  });
});
