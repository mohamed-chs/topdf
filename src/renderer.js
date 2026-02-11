import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import GithubSlugger from 'github-slugger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSS = await readFile(join(__dirname, 'styles/default.css'), 'utf-8');
const HIGHLIGHT_CSS = await readFile(join(__dirname, 'styles/github.css'), 'utf-8');

export class Renderer {
  constructor(options = {}) {
    this.options = {
      margin: '20mm',
      format: 'A4',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  createMarkedInstance(tocHtml = '') {
    const renderer = {
      // Specialized replacement for [TOC] that only works in paragraphs
      // and not inside headings or other structures.
      paragraph: (token) => {
        if (token.text.trim().toLowerCase() === '[toc]') {
          return tocHtml;
        }
        return false; // fall back to default
      }
    };

    return new Marked()
      .use(markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
      }))
      .use(gfmHeadingId())
      .use(footnote())
      .use({ renderer })
      .setOptions({
        gfm: true,
        breaks: true,
      });
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
    }
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  parseFrontmatter(markdown) {
    const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (!match) return { data: {}, content: markdown };

    try {
      return {
        data: yaml.load(match[1]) || {},
        content: markdown.replace(match[0], '')
      };
    } catch (e) {
      console.warn('Failed to parse frontmatter:', e.message);
      return { data: {}, content: markdown };
    }
  }

  generateToc(tokens) {
    const headings = [];
    const tocSlugger = new GithubSlugger();
    const marked = new Marked(); // For inline parsing
    
    const walk = (items) => {
      for (const token of items) {
        if (token.type === 'heading') {
          const raw = token.text.replace(/<[!\/a-z].*?>/gi, '').trim();
          headings.push({
            level: token.depth,
            text: marked.parseInline(token.text),
            id: tocSlugger.slug(raw)
          });
        }
        if (token.tokens) {
          walk(token.tokens);
        }
      }
    };

    walk(tokens);

    if (headings.length === 0) return '';

    const listItems = headings
      .map(h => `<li class="toc-level-${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
      .join('\n');

    return `<div class="toc"><h2>Table of Contents</h2><ul>${listItems}</ul></div>`;
  }

  async renderHtml(markdown, overrides = {}) {
    const options = { ...this.options, ...overrides };
    let { data, content } = this.parseFrontmatter(markdown);

    content = content.replace(/<!--\s*PAGE_BREAK\s*-->/g, '<div class="page-break"></div>');

    // Single pass for lexing
    const lexerMarked = new Marked()
      .use(gfmHeadingId())
      .use(footnote());
    const tokens = lexerMarked.lexer(content);
    
    const hasTocTag = /\[TOC\]/i.test(content);
    const tocEnabled = options.toc || hasTocTag;
    let tocHtml = '';
    if (tocEnabled) {
      tocHtml = this.generateToc(tokens);
    }

    // Use tokens for the second pass too
    const marked = this.createMarkedInstance(tocHtml);
    let htmlContent = marked.parser(tokens);
    
    // If [TOC] wasn't in a paragraph, it might still be in the text as a literal
    if (tocHtml && htmlContent.toLowerCase().includes('[toc]')) {
      htmlContent = htmlContent.replace(/\[toc\]/gi, tocHtml);
    }

    if (tocHtml && options.toc && !htmlContent.includes(tocHtml)) {
      htmlContent = tocHtml + htmlContent;
    }

    let extraCss = '';
    if (options.customCss) {
      try {
        extraCss = await readFile(options.customCss, 'utf-8');
      } catch (e) {
        console.warn(`Failed to load custom CSS: ${e.message}`);
      }
    }

    const title = overrides.title || data.title || 'Markdown Document';
    // Sanitize basePath for use in attribute
    const sanitizedBasePath = options.basePath ? options.basePath.replace(/"/g, '&quot;') : '';
    // Ensure file:// URLs are correctly formatted (especially for Windows)
    let baseHref = '';
    if (sanitizedBasePath) {
      const normalizedPath = sanitizedBasePath.replace(/\\/g, '/');
      baseHref = `file://${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}/`;
    }
    const basePathTag = baseHref ? `<base href="${baseHref}">` : '';
    const combinedCss = DEFAULT_CSS + '\n' + HIGHLIGHT_CSS + '\n' + extraCss;

    // More robust MathJax detection: look for pairs of $ (not preceded by backslash)
    // with no space immediately after the opening $ and no space immediately before the closing $
    // or block math $$, or LaTeX delimiters \( \) \[ \]
    const mathEnabled = options.math !== false;
    const hasMath = mathEnabled && /(?<!\\)\$[^$\s][^$]*[^$\s]\$|(?<!\\)\$[^$\s]\$|(?<!\\)\$\$[\s\S]+\$\$|\\\(|\\\[/.test(content);
    const mathJaxScript = hasMath ? `
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'global' },
      options: { enableErrorOutputs: false }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>` : '';

    if (options.template) {
      try {
        const template = await readFile(options.template, 'utf-8');
        // Use global regex to replace all occurrences and handle potential $ in content safely
        return template
          .replace(/{{title}}/g, () => title)
          .replace(/{{base}}/g, () => basePathTag)
          .replace(/{{css}}/g, () => combinedCss)
          .replace(/{{content}}/g, () => htmlContent)
          .replace(/{{mathjax}}/g, () => mathJaxScript);
      } catch (e) {
        console.warn(`Failed to load template: ${e.message}. Using default.`);
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${basePathTag}
  <title>${title}</title>
  <style>${combinedCss}</style>${mathJaxScript}
</head>
<body class="markdown-body">${htmlContent}</body>
</html>`;
  }

  async generatePdf(markdown, outputPath, overrides = {}) {
    const options = { ...this.options, ...overrides };
    
    // Ensure basePath is absolute for puppeteer if it's not already
    if (options.basePath) {
        const absolutePath = resolve(options.basePath).replace(/\\/g, '/');
        options.basePath = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`;
    }

    const html = await this.renderHtml(markdown, options);

    await this.init();

    try {
      // Use the reused page
      await this.page.setContent(html, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      await this.page.evaluate(async () => {
        if (window.MathJax?.typesetPromise) {
          try {
            await window.MathJax.typesetPromise();
          } catch (e) {
            console.warn('MathJax typeset failed:', e);
          }
        }
      });

      await this.page.pdf({
        path: outputPath,
        format: options.format,
        margin: {
          top: options.margin,
          right: options.margin,
          bottom: options.margin,
          left: options.margin
        },
        printBackground: true,
        displayHeaderFooter: !!(options.headerTemplate || options.footerTemplate),
        headerTemplate: options.headerTemplate || '<span></span>',
        footerTemplate: options.footerTemplate || '<span></span>'
      });
    } catch (error) {
       // If page crashed or something, we might want to recreate it for next call
       if (error.message.includes('Session closed')) {
         this.page = null;
         await this.init();
       }
       throw error;
    }
  }
}

