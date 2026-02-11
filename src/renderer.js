import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import GithubSlugger from 'github-slugger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSS = await readFile(join(__dirname, 'styles/default.css'), 'utf-8');
const HIGHLIGHT_CSS = await readFile(join(__dirname, 'styles/github.css'), 'utf-8');

export class Renderer {
  constructor(options = {}) {
    this.options = {
      margin: '20mm',
      ...options
    };
    this.browser = null;
    this.slugger = new GithubSlugger();
  }

  createMarkedInstance(tocHtml = '') {
    this.slugger = new GithubSlugger();
    const renderer = {
      text(token) {
        if (token.text.toLowerCase() === '[toc]') {
          return tocHtml;
        }
        return token.text;
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
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  parseFrontmatter(markdown) {
    const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
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

  generateToc(marked, tokens) {
    const headings = [];
    const tocSlugger = new GithubSlugger();
    
    const walk = (items) => {
      for (const token of items) {
        if (token.type === 'heading') {
          const raw = token.text.replace(/<[!\/a-z].*?>/gi, '').trim();
          headings.push({
            level: token.depth,
            text: token.text,
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

    // First pass to get tokens for TOC
    const lexerMarked = new Marked()
      .use(gfmHeadingId())
      .use(footnote());
    const tokens = lexerMarked.lexer(content);
    
    const hasTocTag = /\[TOC\]/i.test(content);
    const tocEnabled = options.toc || hasTocTag;
    let tocHtml = '';
    if (tocEnabled) {
      tocHtml = this.generateToc(lexerMarked, tokens);
    }

    // Second pass with TOC replacement in renderer
    const marked = this.createMarkedInstance(tocHtml);
    let htmlContent = marked.parser(tokens);
    
    if (tocHtml && options.toc && !hasTocTag) {
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

    const title = data.title || 'Markdown Document';
    const basePath = options.basePath ? `<base href="file://${options.basePath}/">` : '';
    const combinedCss = DEFAULT_CSS + '\n' + HIGHLIGHT_CSS + '\n' + extraCss;

    const hasMath = /\$|\\\(|\\\[/.test(content);
    const mathJaxScript = hasMath ? `
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'global' }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>` : '';

    if (options.template) {
      try {
        const template = await readFile(options.template, 'utf-8');
        return template
          .replace('{{title}}', title)
          .replace('{{base}}', basePath)
          .replace('{{css}}', combinedCss)
          .replace('{{content}}', htmlContent)
          .replace('{{mathjax}}', mathJaxScript);
      } catch (e) {
        console.warn(`Failed to load template: ${e.message}. Using default.`);
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${basePath}
  <title>${title}</title>
  <style>${combinedCss}</style>${mathJaxScript}
</head>
<body class="markdown-body">${htmlContent}</body>
</html>`;
  }

  async generatePdf(markdown, outputPath, overrides = {}) {
    const options = { ...this.options, ...overrides };
    const html = await this.renderHtml(markdown, options);

    await this.init();

    const page = await this.browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      await page.evaluate(async () => {
        if (window.MathJax?.typesetPromise) {
          await window.MathJax.typesetPromise();
        }
      });

      await page.pdf({
        path: outputPath,
        format: 'A4',
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
    } finally {
      await page.close();
    }
  }
}
