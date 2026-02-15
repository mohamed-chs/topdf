import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { Renderer } from '../src/renderer.js';
import { parseFrontmatter } from '../src/markdown/frontmatter.js';
import { hasMathSyntax } from '../src/markdown/math.js';
import { hasMermaidSyntax } from '../src/markdown/mermaid.js';
import { normalizePaperFormat, normalizeTocDepth, parseMargin } from '../src/utils/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Renderer', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('initializes with sane defaults', () => {
    // @ts-expect-error intentionally checking internal defaults
    expect(renderer.options.margin).toBe('15mm 10mm');
    // @ts-expect-error intentionally checking internal defaults
    expect(renderer.options.format).toBe('A4');
  });

  it('delegates frontmatter parsing and emits warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const parsed = renderer.parseFrontmatter('---\nfoo: [\n---\n# Content');
      expect(parsed.data).toEqual({});
      expect(parsed.content).toContain('---');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('Frontmatter parsing failed');
    } finally {
      warn.mockRestore();
    }
  });

  it('renders basic markdown and heading ids', async () => {
    const html = await renderer.renderHtml('# Heading');
    expect(html).toContain('<h1 id="heading">Heading</h1>');
  });

  it('uses title from frontmatter and escapes it', async () => {
    const html = await renderer.renderHtml('---\ntitle: "<script>x</script>"\n---\n# C');
    expect(html).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>');
    expect(html).not.toContain('<title><script>x</script></title>');
  });

  it('uses renderer-level title override when provided', async () => {
    const html = await new Renderer({ title: 'Configured Title' }).renderHtml(
      '---\ntitle: Frontmatter Title\n---\n# C'
    );
    expect(html).toContain('<title>Configured Title</title>');
    expect(html).not.toContain('<title>Frontmatter Title</title>');
  });

  it('injects base href when basePath is provided', async () => {
    const html = await new Renderer({ basePath: '/tmp/docs' }).renderHtml('# H');
    expect(html).toContain('<base href="file:///tmp/docs/">');
  });

  it('injects MathJax and Mermaid scripts only when needed', async () => {
    const mathOnly = await renderer.renderHtml('$x+y$');
    expect(mathOnly).toContain('MathJax-script');
    expect(mathOnly).not.toContain('Mermaid-script');

    const mermaidOnly = await renderer.renderHtml('```mermaid\ngraph TD;\nA --> B;\n```');
    expect(mermaidOnly).toContain('Mermaid-script');
    expect(mermaidOnly).not.toContain('language-mermaid');
    expect(mermaidOnly).toContain('<div class="mermaid">graph TD;\nA --&gt; B;</div>');
  });

  it('respects explicit math/mermaid overrides', async () => {
    const noMath = await renderer.renderHtml('$x$', { math: false });
    expect(noMath).not.toContain('MathJax-script');

    const noMermaid = await renderer.renderHtml('```mermaid\ngraph TD;\nA-->B;\n```', {
      mermaid: false
    });
    expect(noMermaid).not.toContain('Mermaid-script');
  });

  it('supports code highlighting, task lists, tables and footnotes', async () => {
    const html = await renderer.renderHtml(
      '```js\nconst x = 1;\n```\n\n- [x] done\n\n| A | B |\n|:-|-:|\n| 1 | 2 |\n\nRef[^1]\n\n[^1]: note'
    );
    expect(html).toContain('hljs language-js');
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('align="left"');
    expect(html).toContain('class="footnotes"');
  });

  it('renders page-break markers and preserves markdown link suffixes', async () => {
    const html = await renderer.renderHtml(
      '# A\n\n<!-- PAGE_BREAK -->\n\n[Doc](./guide.md?x=1#top) [Notes](./notes.markdown#frag?x=1)'
    );
    expect(html).toContain('<div class="page-break"></div>');
    expect(html).toContain('href="./guide.pdf?x=1#top"');
    expect(html).toContain('href="./notes.pdf#frag?x=1"');
  });

  it('generates TOC for placeholders and global toc mode', async () => {
    const placeholderHtml = await renderer.renderHtml('# One\n\n[TOC]\n\n## Two\n\n[TOC]', {
      toc: true
    });
    const tocMatches = placeholderHtml.match(/class="toc"/g) ?? [];
    expect(tocMatches).toHaveLength(2);
    expect(placeholderHtml).not.toContain('[[TOC_PLACEHOLDER]]');

    const autoTocHtml = await renderer.renderHtml('# Root\n## Child', { toc: true, tocDepth: 2 });
    expect(autoTocHtml).toContain('class="toc"');
    expect(autoTocHtml).toContain('href="#root"');
  });

  it('preserves math in heading ids and TOC labels', async () => {
    const html = await renderer.renderHtml('# $x$ heading\n\n## Child $y$', { toc: true });
    expect(html).toContain('<h1 id="x-heading">');
    expect(html).toContain('<h2 id="child-y">');
    expect(html).toContain('href="#x-heading">$x$ heading</a>');
    expect(html).toContain('href="#child-y">Child $y$</a>');
  });

  it('keeps markdown formatting inside link labels and rewrites .md links', async () => {
    const html = await renderer.renderHtml(
      '[**Bold** _Em_](https://example.com) [Doc](./guide.md#top) [Long](./notes.markdown)'
    );
    expect(html).toContain('<a href="https://example.com"><strong>Bold</strong> <em>Em</em></a>');
    expect(html).toContain('href="./guide.pdf#top"');
    expect(html).toContain('href="./notes.pdf"');
  });

  it('sanitizes javascript links', async () => {
    const html = await renderer.renderHtml('[Unsafe](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('allows safe protocols and blocks unsafe protocol links', async () => {
    const html = await renderer.renderHtml(
      '[Mail](mailto:test@example.com) [Phone](tel:+123) [File](file:///tmp/a.md) [Data](data:text/html,1)'
    );
    expect(html).toContain('href="mailto:test@example.com"');
    expect(html).toContain('href="tel:+123"');
    expect(html).toContain('href="file:///tmp/a.md"');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('href="data:text/html,1"');
  });

  it('preserves display and inline math content', async () => {
    const html = await renderer.renderHtml(
      '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$\n\nInline: $a & b$'
    );
    expect(html).toContain('a &= b \\\\');
    expect(html).toContain('c &= d');
    expect(html).toContain('$a & b$');
    expect(html).not.toContain('$a &amp; b$');
  });

  it('does not treat code blocks as math', async () => {
    const html = await renderer.renderHtml('```tex\n$$\na &= b \\\\\n$$\n```');
    expect(html).toContain('hljs language-tex');
  });

  it('supports custom template and custom css with clear missing-css errors', async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'convpdf-unit-'));
    try {
      const cssPath = resolve(tempRoot, 'custom.css');
      await writeFile(cssPath, 'body { color: rgb(1, 2, 3); }');

      const customTemplateHtml = await new Renderer({
        template: resolve(__dirname, 'fixtures/template.html')
      }).renderHtml('# HT');
      expect(customTemplateHtml).toContain('Markdown Document - <h1 id="ht">HT</h1>');
      await expect(
        new Renderer({ template: resolve(tempRoot, 'missing-template.html') }).renderHtml('# H')
      ).rejects.toThrow('Failed to read template');

      const customCssHtml = await new Renderer({ customCss: cssPath }).renderHtml('# HT');
      expect(customCssHtml).toContain('rgb(1, 2, 3)');

      await expect(
        new Renderer({ customCss: resolve(tempRoot, 'missing.css') }).renderHtml('# H')
      ).rejects.toThrow('Failed to read custom CSS');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not inject a default footer when only a header template is provided', async () => {
    const rendererWithFakeBrowser = new Renderer();
    const pdfCalls: Array<Record<string, unknown>> = [];

    const fakePage = {
      emulateMediaType: vi.fn(async () => {}),
      setContent: vi.fn(async () => {}),
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => {}),
      pdf: vi.fn(async (options: Record<string, unknown>) => {
        pdfCalls.push(options);
      }),
      close: vi.fn(async () => {})
    };

    // @ts-expect-error injecting a fake browser for unit isolation
    rendererWithFakeBrowser.browser = { newPage: vi.fn(async () => fakePage) } as unknown;

    await rendererWithFakeBrowser.generatePdf(
      '# H',
      resolve(tmpdir(), `convpdf-test-${Date.now()}.pdf`),
      {
        headerTemplate: '<div>H</div>'
      }
    );

    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0]?.displayHeaderFooter).toBe(true);
    expect(pdfCalls[0]?.headerTemplate).toBe('<div>H</div>');
    expect(pdfCalls[0]?.footerTemplate).toBe('<span></span>');
  });

  it('detects mermaid syntax independently', () => {
    expect(hasMermaidSyntax('```mermaid\ngraph LR;\nA-->B;\n```')).toBe(true);
    expect(hasMermaidSyntax('```js\nconsole.log("plain");\n```')).toBe(false);
  });
});

describe('Frontmatter Parsing', () => {
  it('handles missing and empty frontmatter blocks', () => {
    expect(parseFrontmatter('# C')).toEqual({ data: {}, content: '# C', warnings: [] });

    const parsed = parseFrontmatter('---\n---\n# C');
    expect(parsed.data).toEqual({});
    expect(parsed.content.trim()).toBe('# C');
    expect(parsed.warnings).toEqual([]);
  });

  it('returns empty data for non-object frontmatter and unclosed blocks', () => {
    const scalar = parseFrontmatter('---\ntrue\n---\n# C');
    expect(scalar.data).toEqual({});
    expect(scalar.content.trim()).toBe('# C');
    expect(scalar.warnings).toEqual([]);

    const unclosed = parseFrontmatter('---\ntitle: Test\n# C');
    expect(unclosed).toEqual({
      data: {},
      content: '---\ntitle: Test\n# C',
      warnings: []
    });
  });

  it('returns warnings for malformed frontmatter', () => {
    const parsed = parseFrontmatter('---\ni: [\n---\n# C');
    expect(parsed.data).toEqual({});
    expect(parsed.content).toContain('---');
    expect(parsed.warnings).toHaveLength(1);
  });
});

describe('Math Detection', () => {
  it('detects real math and ignores math-like code/link segments', () => {
    expect(hasMathSyntax('Inline $x^2$ math')).toBe(true);
    expect(hasMathSyntax('```js\nconst x = "$not-math$";\n```')).toBe(false);
    expect(hasMathSyntax('[label $x$](https://example.com)')).toBe(true);
  });
});

describe('Validation', () => {
  it('normalizes paper format case-insensitively and rejects invalid formats', () => {
    expect(normalizePaperFormat('a4')).toBe('A4');
    expect(() => normalizePaperFormat('super-a4')).toThrow('Invalid paper format');
  });

  it('parses 1-4 margin shorthands', () => {
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
    expect(parseMargin('1 2 3 4')).toEqual({ top: '1', right: '2', bottom: '3', left: '4' });
  });

  it('uses defaults and rejects invalid margin values', () => {
    expect(parseMargin()).toEqual({
      top: '15mm',
      right: '10mm',
      bottom: '15mm',
      left: '10mm'
    });
    expect(parseMargin(10)).toEqual({ top: '10', right: '10', bottom: '10', left: '10' });
    expect(() => parseMargin('1 2 3 4 5')).toThrow('Invalid margin value');
    expect(() => parseMargin('10qu')).toThrow('Invalid margin token');
  });

  it('validates TOC depth bounds and integer constraints', () => {
    expect(normalizeTocDepth()).toBe(6);
    expect(normalizeTocDepth(1)).toBe(1);
    expect(normalizeTocDepth(6)).toBe(6);
    expect(() => normalizeTocDepth(0)).toThrow('between 1 and 6');
    expect(() => normalizeTocDepth(7)).toThrow('between 1 and 6');
    expect(() => normalizeTocDepth(1.5)).toThrow('Expected an integer');
  });
});
