import { Marked } from 'marked';
import type { Token, Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import yaml from 'js-yaml';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomBytes } from 'crypto';
import GithubSlugger from 'github-slugger';
import type { RendererOptions, Frontmatter, TocHeading, RenderResult, CustomToken, PaperFormat } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFile(join(__dirname, p), 'utf-8');
const [DEFAULT_CSS, HIGHLIGHT_CSS] = await Promise.all([read('styles/default.css'), read('styles/github.css')]);

/**
 * Protect math blocks from Marked processing.
 *
 * Marked's `breaks: true` option converts `\\` at end-of-line into `\<br>`,
 * and its HTML escaping turns `&` into `&amp;` inside math environments.
 * We extract math blocks before lexing and replace them with inert
 * placeholders, then restore the original LaTeX after Marked has produced HTML.
 */
function protectMath(content: string): { text: string; restore: (html: string) => string } {
  const placeholders: Map<string, string> = new Map();
  let counter = 0;

  const nextPlaceholder = (original: string): string => {
    const id = `MATH_PLACEHOLDER_${counter++}_${randomBytes(4).toString('hex')}`;
    placeholders.set(id, original);
    return id;
  };

  // Protect fenced code blocks first so we never touch math inside code
  const codeBlocks: Map<string, string> = new Map();
  let codeCtr = 0;
  let text = content.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, (match) => {
    const id = `CODE_GUARD_${codeCtr++}`;
    codeBlocks.set(id, match);
    return id;
  });

  // Protect display math blocks.
  // We handle three forms in order of specificity:
  //
  // 1. Multiline: $$ on its own line, content, $$ on its own line.
  //    The key is that the content between the delimiters must NOT contain
  //    a line that is just `$$` (non-greedy within lines only).
  text = text.replace(/^\$\$[ \t]*\n((?:(?!\$\$).*\n)*?)^\$\$[ \t]*$/gm, (match) => nextPlaceholder(match));

  // 2. Single-line display math: $$ content $$ (all on one line)
  text = text.replace(/\$\$([^\n]+?)\$\$/g, (match) => nextPlaceholder(match));

  // 3. \[ ... \] display math (possibly multiline)
  text = text.replace(/^\\\[[ \t]*\n((?:(?!\\\]).*\n)*?)^\\\][ \t]*$/gm, (match) => nextPlaceholder(match));
  // Single-line \[ ... \]
  text = text.replace(/\\\[[^\n]*?\\\]/g, (match) => nextPlaceholder(match));

  // Restore code blocks
  for (const [id, code] of codeBlocks) {
    text = text.split(id).join(code);
  }

  const restore = (html: string): string => {
    for (const [id, original] of placeholders) {
      // Use split+join instead of replace() to avoid special replacement
      // patterns ($$ means literal $ in replacement strings)
      html = html.split(id).join(original);
    }
    return html;
  };

  return { text, restore };
}

export class Renderer {
  private options: RendererOptions;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(options: RendererOptions = {}) {
    this.options = { margin: '20mm', format: 'A4', ...options };
  }

  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      this.page = await this.browser.newPage();
    }
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
    this.page = this.browser = null;
  }

  parseFrontmatter(md: string): RenderResult {
    const m = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (!m) return { data: {}, content: md };
    try {
      const frontmatterStr = m[1];
      if (!frontmatterStr) return { data: {}, content: md };
      const data = yaml.load(frontmatterStr) as Frontmatter || {};
      return { data, content: md.replace(m[0], '') };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('Frontmatter error:', message);
      return { data: {}, content: md };
    }
  }

  generateToc(tokens: CustomToken[], depth = 6): string {
    const headings: TocHeading[] = [];
    const marked = new Marked();
    const walk = (items: CustomToken[]) => {
      for (const t of items) {
        if (t.type === 'heading' && t.depth !== undefined && t.depth <= depth) {
          headings.push({
            level: t.depth,
            text: marked.parseInline(t.text || '') as string,
            id: t.id || ''
          });
        }
        if (t.tokens) walk(t.tokens);
      }
    };
    walk(tokens);
    return headings.length ? `<div class="toc"><h2>Table of Contents</h2><ul>${headings.map(h => {
      const cleanLinkText = h.text.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1');
      return `<li class="toc-level-${h.level}"><a href="#${h.id}">${cleanLinkText}</a></li>`;
    }).join('\n')}</ul></div>` : '';
  }

  createMarkedInstance(slugger: GithubSlugger): Marked {
    const instance = new Marked()
      .use(markedHighlight({
        langPrefix: 'hljs language-',
        highlight: (c, l) => {
          const language = hljs.getLanguage(l) ? l : 'plaintext';
          return hljs.highlight(c, { language }).value;
        }
      }))
      .use(footnote())
      .use(gfmHeadingId())
      .use({
        walkTokens(token: Token) {
          const t = token as CustomToken;
          if (t.type === 'heading' && !t.id && slugger && t.text) {
            t.id = slugger.slug(t.text.replace(/<.*?>/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'));
          }
        },
        extensions: [
          {
            name: 'pageBreak',
            level: 'block',
            start(src: string) { return src.match(/<!--\s*PAGE_BREAK\s*-->/)?.index; },
            tokenizer(src: string) {
              const cap = /^<!--\s*PAGE_BREAK\s*-->/.exec(src);
              if (cap) return { type: 'pageBreak', raw: cap[0] };
              return undefined;
            },
            renderer() { return '<div class="page-break"></div>'; }
          },
          {
            name: 'tocPlaceholder',
            level: 'block',
            start(src: string) { return src.match(/\[TOC\]/i)?.index; },
            tokenizer(src: string) {
              const cap = /^\[TOC\]/i.exec(src);
              if (cap) return { type: 'tocPlaceholder', raw: cap[0] };
              return undefined;
            },
            renderer() { return '[[TOC_PLACEHOLDER]]'; }
          }
        ],
        renderer: {
          link(token: Tokens.Link) {
            const { href, title, text } = token;
            const isExternal = /^(?:[a-z+]+:)?\/\//i.test(href);
            const newHref = (!isExternal && href.toLowerCase().endsWith('.md'))
              ? href.replace(/\.md$/i, '.pdf')
              : href;
            let out = `<a href="${newHref}"`;
            if (title) out += ` title="${title}"`;
            out += `>${text}</a>`;
            return out;
          }
        }
      });
    instance.setOptions({ gfm: true, breaks: true });
    return instance;
  }

  async renderHtml(md: string, overrides: RendererOptions = {}): Promise<string> {
    const opts = { ...this.options, ...overrides };
    const { data, content } = this.parseFrontmatter(md);
    const slugger = new GithubSlugger();
    const marked = this.createMarkedInstance(slugger);

    // Protect display math from Marked's breaks/escaping before lexing
    const { text: safeContent, restore: restoreMath } = protectMath(content);

    const tokens = marked.lexer(safeContent) as unknown as CustomToken[];

    // Run all registered walkTokens hooks (marked-highlight, heading IDs, etc.)
    // This is required because lexer() + parser() skips walkTokens, but
    // marked-highlight relies on walkTokens to inject highlighted code into tokens.
    if (marked.defaults.walkTokens) {
      marked.walkTokens(tokens as unknown as Token[], marked.defaults.walkTokens);
    }

    // Populate IDs for TOC (walkTokens above handles the extension hooks,
    // but the manual walk here serves as a fallback for any heading without an id)
    const walk = (items: CustomToken[]) => {
      for (const t of items) {
        if (t.type === 'heading' && !t.id && t.text) {
          t.id = slugger.slug(t.text.replace(/<.*?>/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'));
        }
        if (t.tokens) walk(t.tokens);
      }
    };
    walk(tokens);

    // Move footnotes to the end
    const footnoteIndex = tokens.findIndex(t => t.type === 'footnotes');
    if (footnoteIndex !== -1) {
      const [footnoteToken] = tokens.splice(footnoteIndex, 1);
      if (footnoteToken) tokens.push(footnoteToken);
    }

    const tocDepth = data.tocDepth || opts.tocDepth || 6;
    const hasTocPlaceholder = tokens.some(t => t.type === 'tocPlaceholder');
    const tocHtml = (opts.toc || hasTocPlaceholder) ? this.generateToc(tokens, tocDepth) : '';
    let html = restoreMath(marked.parser(tokens as unknown as Token[]));

    if (tocHtml) {
      if (html.includes('[[TOC_PLACEHOLDER]]')) {
        html = html.replace('[[TOC_PLACEHOLDER]]', tocHtml);
      } else if (opts.toc && !hasTocPlaceholder) {
        html = tocHtml + html;
      }
    }

    const customCssContent = opts.customCss ? await readFile(opts.customCss, 'utf-8').catch(() => '') : '';
    const css = `${DEFAULT_CSS}\n${HIGHLIGHT_CSS}\n${customCssContent}`;
    const base = opts.basePath ? `<base href="${pathToFileURL(resolve(opts.basePath)).href}/">` : '';

    // Improved MathJax detection: ignore matches inside links or escaped dollars
    const contentNoCodeOrLinks = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/\[([^\]]*)\]\([^\)]+\)/g, '$1'); // Strip link URLs, keep text
    const mathRegex = /(?<!\\)\$[^$\s][^$]*[^$\s]\$|(?<!\\)\$[^$\s]\$|(?<!\\)\$\$[\s\S]+\$\$|\\\(|\\\[/;
    const math = (opts.math !== false && mathRegex.test(contentNoCodeOrLinks)) ? `
  <script>window.MathJax = { tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] }, svg: { fontCache: 'global' }, options: { enableErrorOutputs: false } };</script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>` : '';

    const tpl = opts.template ? await readFile(opts.template, 'utf-8').catch(() => null) : null;
    return (tpl || `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">{{base}}<title>{{title}}</title><style>{{css}}</style>{{mathjax}}</head><body class="markdown-body">{{content}}</body></html>`)
      .replace(/{{title}}/g, () => overrides.title || data.title || 'Markdown Document')
      .replace(/{{base}}/g, () => base).replace(/{{css}}/g, () => css).replace(/{{content}}/g, () => html).replace(/{{mathjax}}/g, () => math);
  }

  async generatePdf(md: string, outputPath: string, overrides: RendererOptions = {}): Promise<void> {
    const opts = { ...this.options, ...overrides };
    const html = await this.renderHtml(md, opts);
    await this.init();
    if (!this.page) throw new Error('Browser page not initialized');

    // Write HTML to a temp file so Puppeteer navigates via file:// URL.
    // This allows the browser to load local images referenced with relative
    // paths (or file:// URLs) which setContent() blocks for security reasons.
    const tempDir = opts.basePath ? resolve(opts.basePath) : dirname(resolve(outputPath));
    const tempHtmlPath = join(tempDir, `.topdf-tmp-${randomBytes(8).toString('hex')}.html`);
    await writeFile(tempHtmlPath, html, 'utf-8');

    try {
      // Emulate print media so @media print CSS rules are applied during
      // rendering. Without this, the page renders in "screen" mode and the
      // PDF may have inconsistent sizing (e.g. max-width constraints that
      // shouldn't apply in print, or missing print-specific overrides).
      await this.page.emulateMediaType('print');

      await this.page.goto(pathToFileURL(tempHtmlPath).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.evaluate(async () => {
        // Wait for images
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve());
            img.addEventListener('error', () => resolve());
            setTimeout(resolve, 5000); // Max 5s per image
          });
        }));

        // Wait for MathJax
        const mathJaxScript = document.getElementById('MathJax-script');
        if (!mathJaxScript) return;

        interface MathJaxWindow extends Window {
          MathJax?: {
            typesetPromise: () => Promise<void>;
          };
        }

        const win = window as unknown as MathJaxWindow;

        await new Promise<void>(r => {
          const check = () => {
            if (win.MathJax?.typesetPromise) r();
            else setTimeout(check, 100);
          };
          check();
          setTimeout(r, 10000);
        });
        await win.MathJax?.typesetPromise().catch(() => { });
      });

      const marginParts = String(opts.margin).split(/\s+/).filter(Boolean);
      const m = { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' };
      if (marginParts.length === 1 && marginParts[0]) {
        m.top = m.right = m.bottom = m.left = marginParts[0];
      } else if (marginParts.length === 2 && marginParts[0] && marginParts[1]) {
        m.top = m.bottom = marginParts[0];
        m.right = m.left = marginParts[1];
      } else if (marginParts.length === 3 && marginParts[0] && marginParts[1] && marginParts[2]) {
        m.top = marginParts[0];
        m.right = m.left = marginParts[1];
        m.bottom = marginParts[2];
      } else if (marginParts.length >= 4 && marginParts[0] && marginParts[1] && marginParts[2] && marginParts[3]) {
        m.top = marginParts[0];
        m.right = marginParts[1];
        m.bottom = marginParts[2];
        m.left = marginParts[3];
      }

      await this.page.pdf({
        path: outputPath,
        format: opts.format as PaperFormat,
        printBackground: true,
        margin: m,
        displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
        headerTemplate: opts.headerTemplate || '<span></span>',
        footerTemplate: opts.footerTemplate || '<div style="font-size: 10px; width: 100%; text-align: center; color: #666;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('Session closed')) {
        this.page = null;
      }
      throw e;
    } finally {
      await unlink(tempHtmlPath).catch(() => { });
    }
  }
}
