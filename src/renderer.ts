import type { Token } from 'marked';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';
import { readFile, writeFile, unlink, rm, mkdtemp } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import GithubSlugger from 'github-slugger';
import type { RendererOptions, Frontmatter, CustomToken } from './types.js';
import { parseFrontmatter } from './markdown/frontmatter.js';
import { protectMath, hasMathSyntax } from './markdown/math.js';
import { hasMermaidSyntax } from './markdown/mermaid.js';
import { createMarkedInstance } from './markdown/marked.js';
import { generateToc } from './markdown/toc.js';
import { renderTemplate } from './html/template.js';
import { normalizePaperFormat, normalizeTocDepth, parseMargin } from './utils/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFile(join(__dirname, p), 'utf-8');
const stylesPromise = Promise.all([read('styles/default.css'), read('styles/github.css')]);

export class Renderer {
  private options: RendererOptions;
  private browser: Browser | null = null;
  private initializing: Promise<void> | null = null;

  constructor(options: RendererOptions = {}) {
    this.options = { margin: '15mm 10mm', format: 'A4', ...options };
  }

  async init(): Promise<void> {
    if (this.browser) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        this.browser = await puppeteer.launch({
          headless: true,
          executablePath: this.options.executablePath ?? process.env.PUPPETEER_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to launch browser: ${message}\n\n` +
            'See the Troubleshooting section in README for common issues and solutions:\n' +
            'https://github.com/mohamed-chs/convpdf#troubleshooting'
        );
      } finally {
        this.initializing = null;
      }
    })();

    return this.initializing;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  parseFrontmatter(markdown: string): { data: Frontmatter; content: string } {
    const parsed = parseFrontmatter(markdown);
    for (const warning of parsed.warnings) {
      console.warn(warning);
    }
    return { data: parsed.data, content: parsed.content };
  }

  generateToc(tokens: CustomToken[], depth = 6): string {
    return generateToc(tokens, depth);
  }

  async renderHtml(md: string, overrides: RendererOptions = {}): Promise<string> {
    const opts = { ...this.options, ...overrides };
    const parsedFrontmatter = parseFrontmatter(md);
    const { data, content } = parsedFrontmatter;
    for (const warning of parsedFrontmatter.warnings) {
      console.warn(warning);
    }

    const slugger = new GithubSlugger();
    const marked = createMarkedInstance(slugger);

    // Protect math from Marked's break conversion and entity escaping.
    const { text: safeContent, restore: restoreMath } = protectMath(content);

    const tokens = marked.lexer(safeContent) as unknown as CustomToken[];
    const restoreHeadingMath = (items: CustomToken[]): void => {
      for (const token of items) {
        if (token.type === 'heading' && typeof token.text === 'string') {
          token.text = restoreMath(token.text);
        }
        if (token.tokens?.length) restoreHeadingMath(token.tokens);
      }
    };
    restoreHeadingMath(tokens);

    if (marked.defaults.walkTokens) {
      void marked.walkTokens(tokens as unknown as Token[], marked.defaults.walkTokens);
    }

    const footnoteIndex = tokens.findIndex((t) => t.type === 'footnotes');
    if (footnoteIndex !== -1) {
      const [footnoteToken] = tokens.splice(footnoteIndex, 1);
      if (footnoteToken) tokens.push(footnoteToken);
    }

    const tocDepth = normalizeTocDepth(
      typeof data.tocDepth === 'number' ? data.tocDepth : opts.tocDepth
    );
    const hasTocPlaceholder = tokens.some((t) => t.type === 'tocPlaceholder');
    const frontmatterToc = typeof data.toc === 'boolean' ? data.toc : undefined;
    const tocEnabled = opts.toc ?? frontmatterToc ?? false;
    const tocHtml = tocEnabled || hasTocPlaceholder ? this.generateToc(tokens, tocDepth) : '';
    let html = restoreMath(marked.parser(tokens as unknown as Token[]));

    if (tocHtml) {
      if (html.includes('[[TOC_PLACEHOLDER]]')) {
        html = html.split('[[TOC_PLACEHOLDER]]').join(tocHtml);
      } else if (tocEnabled && !hasTocPlaceholder) {
        html = tocHtml + html;
      }
    }

    let customCssContent = '';
    if (opts.customCss) {
      try {
        customCssContent = await readFile(resolve(opts.customCss), 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read custom CSS at "${opts.customCss}": ${message}`);
      }
    }

    const [defaultCss, highlightCss] = await stylesPromise;
    const css = `${defaultCss}\n${highlightCss}\n${customCssContent}`;
    const title =
      typeof opts.title === 'string'
        ? opts.title
        : typeof data.title === 'string'
          ? data.title
          : 'Markdown Document';

    return renderTemplate({
      templatePath: opts.template,
      title,
      css,
      content: html,
      basePath: opts.basePath,
      includeMathJax: opts.math !== false && hasMathSyntax(content),
      includeMermaid: opts.mermaid !== false && hasMermaidSyntax(content)
    });
  }

  async generatePdf(
    md: string,
    outputPath: string,
    overrides: RendererOptions = {}
  ): Promise<void> {
    const opts = { ...this.options, ...overrides };
    const html = await this.renderHtml(md, opts);
    await this.init();
    if (!this.browser) throw new Error('Browser not initialized');

    const page = await this.browser.newPage();
    const tempDir = await mkdtemp(join(tmpdir(), 'convpdf-'));
    const tempHtmlPath = join(tempDir, 'document.html');
    await writeFile(tempHtmlPath, html, 'utf-8');

    try {
      await page.emulateMediaType('print');

      await page.goto(pathToFileURL(tempHtmlPath).href, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(
          images.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
              img.addEventListener(
                'load',
                () => {
                  resolve();
                },
                { once: true }
              );
              img.addEventListener(
                'error',
                () => {
                  resolve();
                },
                { once: true }
              );
              setTimeout(resolve, 5000); // Max 5s per image
            });
          })
        );

        const win = window as Window & {
          MathJax?: {
            typesetPromise?: () => Promise<void>;
          };
          mermaid?: {
            run?: (options?: { querySelector?: string; suppressErrors?: boolean }) => Promise<void>;
          };
        };
        if (document.getElementById('MathJax-script')) {
          await new Promise<void>((resolve, reject) => {
            const startedAt = Date.now();
            const tick = () => {
              if (win.MathJax?.typesetPromise) {
                resolve();
                return;
              }
              if (Date.now() - startedAt > 10000) {
                reject(new Error('MathJax did not initialize within 10s'));
                return;
              }
              setTimeout(tick, 100);
            };
            tick();
          });
          await win.MathJax?.typesetPromise?.();
        }

        if (document.getElementById('Mermaid-script') && document.querySelector('.mermaid')) {
          await new Promise<void>((resolve, reject) => {
            const startedAt = Date.now();
            const tick = () => {
              if (win.mermaid?.run) {
                resolve();
                return;
              }
              if (Date.now() - startedAt > 10000) {
                reject(new Error('Mermaid did not initialize within 10s'));
                return;
              }
              setTimeout(tick, 100);
            };
            tick();
          });
          await win.mermaid?.run?.({ querySelector: '.mermaid', suppressErrors: false });
        }
      });

      const margin = parseMargin(opts.margin);
      const format = normalizePaperFormat(
        typeof opts.format === 'string' ? opts.format : undefined
      );
      await page.pdf({
        path: outputPath,
        format,
        printBackground: true,
        margin,
        displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
        headerTemplate: opts.headerTemplate || '<span></span>',
        footerTemplate: opts.footerTemplate || '<span></span>'
      });
    } finally {
      await page.close().catch(() => {});
      await unlink(tempHtmlPath).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
