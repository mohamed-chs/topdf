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

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSS = await readFile(join(__dirname, 'styles/default.css'), 'utf-8');

export class Renderer {
  constructor(options = {}) {
    this.options = {
      margin: '20mm',
      ...options
    };
    
    this.marked = new Marked()
      .use(markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
      }))
      .use(gfmHeadingId())
      .use(footnote())
      .setOptions({
        gfm: true,
        breaks: true,
      });
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

  generateToc(markdown) {
    const headings = markdown.split('\n')
      .map(line => line.match(/^(#{1,6})\s+(.+)$/))
      .filter(Boolean)
      .map(match => ({
        level: match[1].length,
        text: match[2].trim(),
        id: match[2].trim().toLowerCase().replace(/[^\w]+/g, '-')
      }));

    if (headings.length === 0) return '';

    const listItems = headings
      .map(h => `<li class="toc-level-${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
      .join('\n');

    return `<div class="toc"><h2>Table of Contents</h2><ul>${listItems}</ul></div>`;
  }

  async renderHtml(markdown, overrides = {}) {
    const options = { ...this.options, ...overrides };
    let { data, content } = this.parseFrontmatter(markdown);

    let tocHtml = '';
    if (options.toc || content.includes('[TOC]')) {
      tocHtml = this.generateToc(content);
      if (content.includes('[TOC]')) {
        content = content.replace('[TOC]', tocHtml);
        tocHtml = '';
      }
    }

    const processedMd = content.replace(/<!--\s*PAGE_BREAK\s*-->/g, '<div class="page-break"></div>');
    let htmlContent = await this.marked.parse(processedMd);
    if (tocHtml) htmlContent = tocHtml + htmlContent;

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

    if (options.template) {
      try {
        const template = await readFile(options.template, 'utf-8');
        return template
          .replace('{{title}}', title)
          .replace('{{base}}', basePath)
          .replace('{{css}}', DEFAULT_CSS + '\n' + extraCss)
          .replace('{{content}}', htmlContent);
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
  <style>${DEFAULT_CSS}${extraCss}</style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'global' }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body class="markdown-body">${htmlContent}</body>
</html>`;
  }

  async generatePdf(markdown, outputPath, overrides = {}) {
    const options = { ...this.options, ...overrides };
    const html = await this.renderHtml(markdown, options);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
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
      await browser.close();
    }
  }
}

  