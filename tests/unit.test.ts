import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { parseFrontmatter } from '../src/markdown/frontmatter.js';
import { hasMermaidSyntax } from '../src/markdown/mermaid.js';
import { normalizePaperFormat, normalizeTocDepth, parseMargin } from '../src/utils/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer', () => {
  let r: Renderer;
  beforeEach(() => {
    r = new Renderer();
  });

  it('parses frontmatter', () => {
    const { data, content } = r.parseFrontmatter('---\nt: H\n---\n# W');
    expect(data['t']).toBe('H');
    expect(content.trim()).toBe('# W');
  });

  it('uses default options', () => {
    // @ts-expect-error - testing private options
    expect(r.options.margin).toBe('15mm 10mm');
    // @ts-expect-error - testing private options
    expect(r.options.format).toBe('A4');
  });

  it('handles empty frontmatter as metadata section', () => {
    const parsed = parseFrontmatter('---\n---\n# C');
    expect(parsed.data).toEqual({});
    expect(parsed.content.trim()).toBe('# C');
    expect(parsed.warnings).toEqual([]);
  });

  it('returns warning for malformed frontmatter', () => {
    const parsed = parseFrontmatter('---\ni: [\n---\n# C');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toContain('---');
    expect(parsed.warnings.length).toBe(1);
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

  it('does not include MathJax script when math is disabled', async () => {
    expect(await r.renderHtml('$E=mc^2$', { math: false })).not.toContain('MathJax-script');
  });

  it('includes Mermaid script and renders mermaid fences as diagram containers', async () => {
    const html = await r.renderHtml('```mermaid\ngraph TD;\nA --> B;\n```');
    expect(html).toContain('Mermaid-script');
    expect(html).toContain('<div class="mermaid">graph TD;\nA --&gt; B;</div>');
    expect(html).not.toContain('language-mermaid');
  });

  it('does not include Mermaid script when mermaid is disabled', async () => {
    const html = await r.renderHtml('```mermaid\ngraph TD;\nA --> B;\n```', { mermaid: false });
    expect(html).not.toContain('Mermaid-script');
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
    const html = await new Renderer({
      template: resolve(__dirname, 'fixtures/template.html')
    }).renderHtml('# HT');
    expect(html).toContain('Markdown Document - <h1 id="ht">HT</h1>');
  });

  it('escapes title values from frontmatter', async () => {
    const html = await r.renderHtml('---\ntitle: "<script>boom</script>"\n---\n# C');
    expect(html).toContain('&lt;script&gt;boom&lt;/script&gt;');
    expect(html).not.toContain('<title><script>boom</script></title>');
  });

  it('injects base tag', async () => {
    expect(await new Renderer({ basePath: '/p' }).renderHtml('# H')).toContain(
      '<base href="file:///p/">'
    );
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

  it('rewrites markdown links from .md to .pdf', async () => {
    const html = await r.renderHtml('[Doc](./guide.md)');
    expect(html).toContain('href="./guide.pdf"');
  });

  it('rewrites markdown links with anchors, query strings, and .markdown extension', async () => {
    const html = await r.renderHtml(
      '[Anchor](./guide.md#intro) [Query](./guide.md?x=1#top) [Long](./guide.markdown)'
    );
    expect(html).toContain('href="./guide.pdf#intro"');
    expect(html).toContain('href="./guide.pdf?x=1#top"');
    expect(html).toContain('href="./guide.pdf"');
  });

  it('renders markdown formatting inside link text', async () => {
    const html = await r.renderHtml('[**Bold** _Em_](https://example.com)');
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>Em</em>');
  });

  it('sanitizes dangerous javascript links', async () => {
    const html = await r.renderHtml('[Unsafe](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:alert(1)');
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

  it('preserves ampersands in inline math', async () => {
    const html = await r.renderHtml('Inline math $a & b$ should stay intact.');
    expect(html).toContain('$a & b$');
    expect(html).not.toContain('$a &amp; b$');
  });

  it('replaces all TOC placeholders', async () => {
    const html = await r.renderHtml('# One\n\n[TOC]\n\n## Two\n\n[TOC]', { toc: true });
    const tocMatches = html.match(/class="toc"/g) ?? [];
    expect(tocMatches.length).toBe(2);
    expect(html).not.toContain('[[TOC_PLACEHOLDER]]');
  });

  it('supports custom css and fails clearly when missing', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'convpdf-unit-css-'));
    try {
      const cssPath = resolve(dir, 'custom.css');
      await writeFile(cssPath, 'body { color: rgb(1, 2, 3); }');
      const html = await new Renderer({ customCss: cssPath }).renderHtml('# H');
      expect(html).toContain('rgb(1, 2, 3)');

      await expect(
        new Renderer({ customCss: resolve(dir, 'missing.css') }).renderHtml('# H')
      ).rejects.toThrow('Failed to read custom CSS');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detects mermaid fenced blocks', () => {
    expect(hasMermaidSyntax('```mermaid\ngraph LR;\nA-->B;\n```')).toBe(true);
    expect(hasMermaidSyntax('```js\nconsole.log("no mermaid");\n```')).toBe(false);
  });
});

describe('Validation', () => {
  it('normalizes paper format case-insensitively', () => {
    expect(normalizePaperFormat('a4')).toBe('A4');
  });

  it('throws on invalid paper format', () => {
    expect(() => normalizePaperFormat('super-a4')).toThrow('Invalid paper format');
  });

  it('parses 1-4 margin shorthand values', () => {
    expect(parseMargin('12mm')).toEqual({
      top: '12mm',
      right: '12mm',
      bottom: '12mm',
      left: '12mm'
    });
    expect(parseMargin('12mm 8mm')).toEqual({
      top: '12mm',
      right: '8mm',
      bottom: '12mm',
      left: '8mm'
    });
    expect(parseMargin('1in 2in 3in')).toEqual({
      top: '1in',
      right: '2in',
      bottom: '3in',
      left: '2in'
    });
  });

  it('uses default margin if not provided', () => {
    expect(parseMargin()).toEqual({
      top: '15mm',
      right: '10mm',
      bottom: '15mm',
      left: '10mm'
    });
  });

  it('accepts numeric margins by coercing to CSS lengths', () => {
    expect(parseMargin(10)).toEqual({
      top: '10',
      right: '10',
      bottom: '10',
      left: '10'
    });
  });

  it('throws for invalid margin shape', () => {
    expect(() => parseMargin('1 2 3 4 5')).toThrow('Invalid margin value');
  });

  it('validates toc depth bounds', () => {
    expect(normalizeTocDepth(1)).toBe(1);
    expect(normalizeTocDepth(6)).toBe(6);
    expect(() => normalizeTocDepth(0)).toThrow('between 1 and 6');
    expect(() => normalizeTocDepth(7)).toThrow('between 1 and 6');
  });
});
