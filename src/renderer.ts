import type { Token } from 'marked';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';
import GithubSlugger from 'github-slugger';
import type { RendererOptions, CustomToken } from './types.js';
import { parseFrontmatter } from './markdown/frontmatter.js';
import { protectMath, hasMathSyntax } from './markdown/math.js';
import { hasMermaidSyntax } from './markdown/mermaid.js';
import { createMarkedInstance } from './markdown/marked.js';
import { generateToc } from './markdown/toc.js';
import { renderTemplate } from './html/template.js';
import { normalizePaperFormat, normalizeTocDepth, parseMargin } from './utils/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (pathValue: string) => readFile(join(__dirname, pathValue), 'utf-8');
const stylesPromise = Promise.all([read('styles/default.css'), read('styles/github.css')]);

const DEFAULT_RENDERER_OPTIONS: Readonly<{
  margin: string;
  format: NonNullable<RendererOptions['format']>;
  linkTargetFormat: NonNullable<RendererOptions['linkTargetFormat']>;
}> = {
  margin: '15mm 10mm',
  format: 'A4',
  linkTargetFormat: 'pdf'
};

const RENDER_TIMEOUT_MS = 60000;

interface RuntimeRenderOptions extends RendererOptions {
  margin: string;
  format: NonNullable<RendererOptions['format']>;
}

const mergeOptions = (base: RendererOptions, overrides: RendererOptions): RuntimeRenderOptions => {
  const merged = { ...DEFAULT_RENDERER_OPTIONS, ...base, ...overrides };
  return {
    ...merged,
    margin: merged.margin ?? DEFAULT_RENDERER_OPTIONS.margin,
    format: merged.format ?? DEFAULT_RENDERER_OPTIONS.format
  };
};

const reorderFootnotesToEnd = (tokens: CustomToken[]): void => {
  const footnoteIndex = tokens.findIndex((token) => token.type === 'footnotes');
  if (footnoteIndex < 0) return;
  const [footnotes] = tokens.splice(footnoteIndex, 1);
  if (footnotes) tokens.push(footnotes);
};

const restoreMathInHeadingTokens = (
  tokens: CustomToken[],
  restoreMath: (value: string) => string
): void => {
  for (const token of tokens) {
    if (token.type === 'heading' && typeof token.text === 'string') {
      token.text = restoreMath(token.text);
    }
    if (token.tokens?.length) {
      restoreMathInHeadingTokens(token.tokens, restoreMath);
    }
  }
};

const waitForDynamicContent = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const waitUntil = async (
      check: () => boolean,
      timeoutMs: number,
      label: string
    ): Promise<void> => {
      const startedAt = Date.now();
      while (!check()) {
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error(`${label} did not initialize within ${timeoutMs}ms`);
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    };

    const images = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      images.map(async (image) => {
        if (image.complete) return;
        await new Promise<void>((resolveImage) => {
          const complete = () => {
            resolveImage();
          };
          image.addEventListener('load', complete, { once: true });
          image.addEventListener('error', complete, { once: true });
          setTimeout(complete, 5000);
        });
      })
    );

    const win = window as Window & {
      MathJax?: { typesetPromise?: () => Promise<void> };
      mermaid?: {
        run?: (options?: { querySelector?: string; suppressErrors?: boolean }) => Promise<void>;
      };
    };

    if (document.getElementById('MathJax-script')) {
      await waitUntil(() => typeof win.MathJax?.typesetPromise === 'function', 10000, 'MathJax');
      await win.MathJax?.typesetPromise?.();
    }

    if (document.getElementById('Mermaid-script') && document.querySelector('.mermaid')) {
      await waitUntil(() => typeof win.mermaid?.run === 'function', 10000, 'Mermaid');
      await win.mermaid?.run?.({ querySelector: '.mermaid', suppressErrors: false });
    }
  });
};

export class Renderer {
  private options: RendererOptions;
  private browser: Browser | null = null;
  private initializing: Promise<void> | null = null;

  constructor(options: RendererOptions = {}) {
    this.options = { ...DEFAULT_RENDERER_OPTIONS, ...options };
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
    if (!this.browser) return;
    await this.browser.close();
    this.browser = null;
  }

  async renderHtml(markdown: string, overrides: RendererOptions = {}): Promise<string> {
    const opts = mergeOptions(this.options, overrides);
    const parsedFrontmatter = parseFrontmatter(markdown);
    const { data, content } = parsedFrontmatter;
    for (const warning of parsedFrontmatter.warnings) {
      console.warn(warning);
    }

    const slugger = new GithubSlugger();
    const marked = createMarkedInstance(slugger, opts.linkTargetFormat);

    // Guard math content so Marked does not rewrite it.
    const {
      text: safeContent,
      restore: restoreMath,
      restoreHtml: restoreMathHtml
    } = protectMath(content);
    const tokens = marked.lexer(safeContent) as unknown as CustomToken[];

    restoreMathInHeadingTokens(tokens, restoreMath);
    if (marked.defaults.walkTokens) {
      void marked.walkTokens(tokens as unknown as Token[], marked.defaults.walkTokens);
    }

    reorderFootnotesToEnd(tokens);

    const tocDepth = normalizeTocDepth(
      typeof data.tocDepth === 'number' ? data.tocDepth : opts.tocDepth
    );
    const hasTocPlaceholder = tokens.some((token) => token.type === 'tocPlaceholder');
    const frontmatterToc = typeof data.toc === 'boolean' ? data.toc : undefined;
    const tocEnabled = opts.toc ?? frontmatterToc ?? false;
    const tocHtml = tocEnabled || hasTocPlaceholder ? generateToc(tokens, tocDepth) : '';

    let html = restoreMathHtml(marked.parser(tokens as unknown as Token[]));
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
    markdown: string,
    outputPath: string,
    overrides: RendererOptions = {}
  ): Promise<void> {
    const opts = mergeOptions(this.options, overrides);
    const html = await this.renderHtml(markdown, opts);

    await this.init();
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    await mkdir(dirname(outputPath), { recursive: true });

    const page = await this.browser.newPage();
    const tempDir = await mkdtemp(join(tmpdir(), 'convpdf-'));
    const tempHtmlPath = join(tempDir, 'document.html');
    await writeFile(tempHtmlPath, html, 'utf-8');

    try {
      await page.emulateMediaType('print');
      await page.goto(pathToFileURL(tempHtmlPath).href, {
        waitUntil: 'networkidle0',
        timeout: RENDER_TIMEOUT_MS
      });
      await waitForDynamicContent(page);

      const margin = parseMargin(opts.margin);
      const format = normalizePaperFormat(
        typeof opts.format === 'string' ? opts.format : DEFAULT_RENDERER_OPTIONS.format
      );

      await page.pdf({
        path: outputPath,
        format,
        printBackground: true,
        margin,
        displayHeaderFooter: Boolean(opts.headerTemplate || opts.footerTemplate),
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
