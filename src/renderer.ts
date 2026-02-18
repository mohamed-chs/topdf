import type { Token } from 'marked';
import { PDFDocument, PDFName, PDFDict, PDFString, PDFHexString } from 'pdf-lib';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import GithubSlugger from 'github-slugger';
import type { CustomToken, RendererOptions } from './types.js';
import { parseFrontmatter } from './markdown/frontmatter.js';
import { hasMathSyntax, protectMath } from './markdown/math.js';
import { hasMermaidSyntax } from './markdown/mermaid.js';
import { createMarkedInstance } from './markdown/marked.js';
import { generateToc } from './markdown/toc.js';
import { renderTemplate } from './html/template.js';
import {
  normalizeMaxConcurrentPages,
  normalizePaperFormat,
  normalizeTocDepth,
  parseMargin
} from './utils/validation.js';
import { resolveRuntimeAssetSources } from './assets/resolve.js';
import { getRuntimeAssetPaths } from './assets/manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (pathValue: string) => readFile(join(__dirname, pathValue), 'utf-8');
const stylesPromise = Promise.all([read('styles/default.css'), read('styles/github.css')]);

const DEFAULT_RENDERER_OPTIONS: Readonly<{
  margin: string;
  format: NonNullable<RendererOptions['format']>;
  linkTargetFormat: NonNullable<RendererOptions['linkTargetFormat']>;
  assetMode: NonNullable<RendererOptions['assetMode']>;
  allowNetworkFallback: NonNullable<RendererOptions['allowNetworkFallback']>;
  maxConcurrentPages: NonNullable<RendererOptions['maxConcurrentPages']>;
}> = {
  margin: '15mm 10mm',
  format: 'A4',
  linkTargetFormat: 'pdf',
  assetMode: 'auto',
  allowNetworkFallback: true,
  maxConcurrentPages: 8
};

const RENDER_TIMEOUT_MS = 60000;

interface RuntimeRenderOptions extends RendererOptions {
  margin: string;
  format: NonNullable<RendererOptions['format']>;
  assetMode: NonNullable<RendererOptions['assetMode']>;
  allowNetworkFallback: NonNullable<RendererOptions['allowNetworkFallback']>;
  maxConcurrentPages: NonNullable<RendererOptions['maxConcurrentPages']>;
}

interface RenderHttpServer {
  baseUrl: string;
  setDocumentHtml: (html: string) => void;
  close: () => Promise<void>;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const mergeOptions = (base: RendererOptions, overrides: RendererOptions): RuntimeRenderOptions => {
  const merged = { ...DEFAULT_RENDERER_OPTIONS, ...base, ...overrides };
  const maxConcurrentPagesRaw = merged.maxConcurrentPages;
  const maxConcurrentPages =
    typeof maxConcurrentPagesRaw === 'number'
      ? normalizeMaxConcurrentPages(maxConcurrentPagesRaw)
      : DEFAULT_RENDERER_OPTIONS.maxConcurrentPages;
  return {
    ...merged,
    margin: merged.margin ?? DEFAULT_RENDERER_OPTIONS.margin,
    format: merged.format ?? DEFAULT_RENDERER_OPTIONS.format,
    assetMode: merged.assetMode ?? DEFAULT_RENDERER_OPTIONS.assetMode,
    allowNetworkFallback:
      merged.allowNetworkFallback ?? DEFAULT_RENDERER_OPTIONS.allowNetworkFallback,
    maxConcurrentPages
  };
};

const resolveRuntimeAssetPlan = async (
  opts: RuntimeRenderOptions,
  usage: { math: boolean; mermaid: boolean },
  serverBaseUrl?: string
): Promise<{
  mathJaxSrc?: string;
  mermaidSrc?: string;
  mathJaxBaseUrl?: string;
  mathJaxFontBaseUrl?: string;
  warning?: string;
}> => {
  if (!usage.math && !usage.mermaid) {
    return {};
  }

  const needsMathAssetResolution = usage.math && !opts.mathJaxSrc;
  const needsMermaidAssetResolution = usage.mermaid && !opts.mermaidSrc;
  if (!needsMathAssetResolution && !needsMermaidAssetResolution) {
    return {
      mathJaxSrc: opts.mathJaxSrc,
      mermaidSrc: opts.mermaidSrc,
      mathJaxBaseUrl: opts.mathJaxBaseUrl,
      mathJaxFontBaseUrl: opts.mathJaxFontBaseUrl
    };
  }

  const resolved = await resolveRuntimeAssetSources({
    mode: opts.assetMode,
    cacheDir: opts.assetCacheDir,
    allowNetworkFallback: opts.allowNetworkFallback,
    serverBaseUrl
  });

  return {
    mathJaxSrc: opts.mathJaxSrc ?? resolved.mathJaxSrc,
    mermaidSrc: opts.mermaidSrc ?? resolved.mermaidSrc,
    mathJaxBaseUrl: opts.mathJaxBaseUrl ?? resolved.mathJaxBaseUrl,
    mathJaxFontBaseUrl: opts.mathJaxFontBaseUrl ?? resolved.mathJaxFontBaseUrl,
    warning: resolved.warning
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
      MathJax?: {
        startup?: { promise?: Promise<void> };
        typesetPromise?: () => Promise<void>;
      };
      mermaid?: {
        run?: (options?: { querySelector?: string; suppressErrors?: boolean }) => Promise<void>;
      };
    };

    if (document.getElementById('MathJax-script')) {
      await waitUntil(
        () => typeof win.MathJax?.typesetPromise === 'function' || !!win.MathJax?.startup?.promise,
        10000,
        'MathJax'
      );
      if (win.MathJax?.startup?.promise) {
        await win.MathJax.startup.promise;
      }
      await win.MathJax?.typesetPromise?.();
    }

    if (document.getElementById('Mermaid-script') && document.querySelector('.mermaid')) {
      await waitUntil(() => typeof win.mermaid?.run === 'function', 10000, 'Mermaid');
      if (document.fonts && 'ready' in document.fonts) {
        await document.fonts.ready;
      }
      await win.mermaid?.run?.({ querySelector: '.mermaid', suppressErrors: false });
    }

    if (document.fonts && 'ready' in document.fonts) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        resolveFrame();
      });
    });
  });
};

const normalizeRelativeHref = (basePath: string, targetPath: string, suffix: string): string => {
  let relPath = relative(resolve(basePath), targetPath).split('\\').join('/');
  if (!relPath) relPath = '.';
  if (!relPath.startsWith('.') && !relPath.startsWith('/')) {
    relPath = `./${relPath}`;
  }
  return `${relPath}${suffix}`;
};

const toRelativeHrefFromFileUrl = (href: string, basePath: string): string | null => {
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'file:') return null;
    const targetPath = fileURLToPath(parsed);
    return normalizeRelativeHref(basePath, targetPath, `${parsed.search}${parsed.hash}`);
  } catch {
    return null;
  }
};

const toRelativeHrefFromServerUrl = (
  href: string,
  basePath: string,
  renderServerBaseUrl: string
): string | null => {
  try {
    const parsed = new URL(href);
    const serverBase = new URL(renderServerBaseUrl);
    if (parsed.origin !== serverBase.origin) return null;

    const prefix = '/__convpdf_source/';
    if (!parsed.pathname.startsWith(prefix)) return null;

    const sourceRelative = decodeURIComponent(parsed.pathname.slice(prefix.length));
    const targetPath = resolve(basePath, sourceRelative);
    return normalizeRelativeHref(basePath, targetPath, `${parsed.search}${parsed.hash}`);
  } catch {
    return null;
  }
};

const rewritePdfFileUrisToRelative = async (
  outputPath: string,
  basePath: string,
  renderServerBaseUrl?: string
): Promise<void> => {
  const pdfBytes = await readFile(outputPath);
  const pdfDocument = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const actionKey = PDFName.of('A');
  const uriKey = PDFName.of('URI');
  let changed = false;

  for (const page of pdfDocument.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;

    for (let index = 0; index < annotations.size(); index++) {
      const annotation = annotations.lookup(index, PDFDict);
      const action = annotation.lookupMaybe(actionKey, PDFDict);
      if (!action) continue;

      const uri = action.lookupMaybe(uriKey, PDFString, PDFHexString);
      if (!uri) continue;

      const href = uri.decodeText();
      const relativeHrefFromFile = toRelativeHrefFromFileUrl(href, basePath);
      const relativeHrefFromServer = renderServerBaseUrl
        ? toRelativeHrefFromServerUrl(href, basePath, renderServerBaseUrl)
        : null;
      const relativeHref = relativeHrefFromFile ?? relativeHrefFromServer;

      if (!relativeHref || href === relativeHref) continue;

      action.set(uriKey, PDFString.of(relativeHref));
      changed = true;
    }
  }

  if (!changed) return;

  const rewritten = await pdfDocument.save({
    updateFieldAppearances: false,
    useObjectStreams: false
  });
  await writeFile(outputPath, rewritten);
};

const sendError = (res: ServerResponse, code: number): void => {
  res.statusCode = code;
  res.end(code === 404 ? 'Not Found' : 'Internal Server Error');
};

const serveFile = async (res: ServerResponse, absolutePath: string): Promise<void> => {
  try {
    const buffer = await readFile(absolutePath);
    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      MIME_TYPES[extname(absolutePath).toLowerCase()] ?? 'application/octet-stream'
    );
    res.end(buffer);
  } catch {
    sendError(res, 404);
  }
};

const resolveUnder = (basePath: string, relativePathValue: string): string | null => {
  const candidate = resolve(basePath, relativePathValue);
  const normalizedBase = resolve(basePath);
  if (
    candidate === normalizedBase ||
    candidate.startsWith(`${normalizedBase}${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    return candidate;
  }
  return null;
};

const createRenderServer = async (options: {
  sourceBasePath?: string;
  assetCacheDir?: string;
}): Promise<RenderHttpServer> => {
  let documentHtml = '';
  const runtimePaths = getRuntimeAssetPaths(options.assetCacheDir);

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/document.html') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(documentHtml);
      return;
    }

    if (pathname.startsWith('/__convpdf_source/')) {
      if (!options.sourceBasePath) {
        sendError(res, 404);
        return;
      }
      const relPath = pathname.slice('/__convpdf_source/'.length);
      const absolute = resolveUnder(options.sourceBasePath, relPath);
      if (!absolute) {
        sendError(res, 404);
        return;
      }
      await serveFile(res, absolute);
      return;
    }

    if (pathname.startsWith('/__convpdf_assets/mathjax/')) {
      const relPath = pathname.slice('/__convpdf_assets/mathjax/'.length);
      const absolute = resolveUnder(runtimePaths.mathJaxDir, relPath);
      if (!absolute) {
        sendError(res, 404);
        return;
      }
      await serveFile(res, absolute);
      return;
    }

    if (pathname.startsWith('/__convpdf_assets/mathjax-newcm-font/')) {
      const relPath = pathname.slice('/__convpdf_assets/mathjax-newcm-font/'.length);
      const absolute = resolveUnder(runtimePaths.mathJaxFontDir, relPath);
      if (!absolute) {
        sendError(res, 404);
        return;
      }
      await serveFile(res, absolute);
      return;
    }

    if (pathname === '/__convpdf_assets/mermaid/mermaid.min.js') {
      await serveFile(res, runtimePaths.mermaidPath);
      return;
    }

    sendError(res, 404);
  };

  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      sendError(res, 500);
    });
  });

  await new Promise<void>((resolveStart, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectStart);
      resolveStart();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolveClose) => {
      server.close(() => {
        resolveClose();
      });
    });
    throw new Error('Failed to start render server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    setDocumentHtml: (html: string) => {
      documentHtml = html;
    },
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => {
          resolveClose();
        });
      })
  };
};

export class Renderer {
  private options: RendererOptions;
  private browser: Browser | null = null;
  private initializing: Promise<void> | null = null;
  private activePages = 0;
  private readonly pageWaiters: Array<() => void> = [];

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
    this.activePages = 0;
    const waiters = this.pageWaiters.splice(0, this.pageWaiters.length);
    for (const wake of waiters) wake();
  }

  private async acquirePage(maxConcurrentPages: number): Promise<Page> {
    while (this.activePages >= maxConcurrentPages) {
      await new Promise<void>((resolveWaiter) => {
        this.pageWaiters.push(resolveWaiter);
      });
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }
    }
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    this.activePages += 1;
    try {
      return await this.browser.newPage();
    } catch (error) {
      this.activePages = Math.max(0, this.activePages - 1);
      const wakeNext = this.pageWaiters.shift();
      if (wakeNext) wakeNext();
      throw error;
    }
  }

  private releasePage(): void {
    this.activePages = Math.max(0, this.activePages - 1);
    const wakeNext = this.pageWaiters.shift();
    if (wakeNext) wakeNext();
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

    const runtimeUsage = { math: hasMathSyntax(content), mermaid: hasMermaidSyntax(content) };
    const runtimeAssets = await resolveRuntimeAssetPlan(opts, runtimeUsage);

    if (runtimeAssets.warning) {
      console.warn(runtimeAssets.warning);
    }

    return renderTemplate({
      templatePath: opts.template,
      title,
      css,
      content: html,
      basePath: opts.basePath,
      baseHref: opts.baseHref,
      includeMathJax: runtimeUsage.math,
      includeMermaid: runtimeUsage.mermaid,
      mathJaxSrc: runtimeAssets.mathJaxSrc,
      mermaidSrc: runtimeAssets.mermaidSrc,
      mathJaxBaseUrl: runtimeAssets.mathJaxBaseUrl,
      mathJaxFontBaseUrl: runtimeAssets.mathJaxFontBaseUrl
    });
  }

  async generatePdf(
    markdown: string,
    outputPath: string,
    overrides: RendererOptions = {}
  ): Promise<void> {
    const opts = mergeOptions(this.options, overrides);

    await this.init();
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    await mkdir(dirname(outputPath), { recursive: true });

    let page: Page | null = null;
    let renderServer: RenderHttpServer | null = null;

    try {
      page = await this.acquirePage(opts.maxConcurrentPages);
      renderServer = await createRenderServer({
        sourceBasePath: opts.basePath,
        assetCacheDir: opts.assetCacheDir
      });

      const runtimeUsage = { math: hasMathSyntax(markdown), mermaid: hasMermaidSyntax(markdown) };
      const runtimeAssets = await resolveRuntimeAssetPlan(opts, runtimeUsage, renderServer.baseUrl);
      if (runtimeAssets.warning) {
        console.warn(runtimeAssets.warning);
      }

      const html = await this.renderHtml(markdown, {
        ...opts,
        basePath: undefined,
        baseHref: opts.basePath ? `${renderServer.baseUrl}/__convpdf_source/` : opts.baseHref,
        mathJaxSrc: runtimeAssets.mathJaxSrc,
        mermaidSrc: runtimeAssets.mermaidSrc,
        mathJaxBaseUrl: runtimeAssets.mathJaxBaseUrl,
        mathJaxFontBaseUrl: runtimeAssets.mathJaxFontBaseUrl
      });
      renderServer.setDocumentHtml(html);

      await page.emulateMediaType('print');
      await page.goto(`${renderServer.baseUrl}/document.html`, {
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
        waitForFonts: true,
        displayHeaderFooter: Boolean(opts.headerTemplate || opts.footerTemplate),
        headerTemplate: opts.headerTemplate || '<span></span>',
        footerTemplate: opts.footerTemplate || '<span></span>'
      });

      if (opts.basePath) {
        await rewritePdfFileUrisToRelative(outputPath, opts.basePath, renderServer.baseUrl);
      }
    } finally {
      if (page) {
        await page.close().catch(() => {});
        this.releasePage();
      }
      if (renderServer) {
        await renderServer.close().catch(() => {});
      }
    }
  }
}
