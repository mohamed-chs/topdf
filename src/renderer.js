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

export class Renderer {
  constructor(options = {}) {
    this.options = options;
    this.marked = new Marked(
      markedHighlight({
        langPrefix: 'hljs language-',
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
      })
    );
    
    this.marked.use(gfmHeadingId());
    this.marked.use(footnote());
    
    // Set other marked options
    this.marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }

  parseFrontmatter(markdown) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = markdown.match(frontmatterRegex);
    
    if (match) {
      try {
        const data = yaml.load(match[1]);
        const content = markdown.replace(frontmatterRegex, '');
        return { data, content };
      } catch (e) {
        console.warn('Failed to parse frontmatter:', e.message);
      }
    }
    
    return { data: {}, content: markdown };
  }

  generateToc(markdown) {
    const lines = markdown.split('\n');
    const toc = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/;
    
    for (const line of lines) {
      const match = line.match(headingRegex);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text.toLowerCase().replace(/[^\w]+/g, '-');
        toc.push({ level, text, id });
      }
    }
    
    if (toc.length === 0) return '';
    
    return '<div class="toc"><h2>Table of Contents</h2><ul>' +
      toc.map(item => `<li class="toc-level-${item.level}"><a href="#${item.id}">${item.text}</a></li>`).join('\n') +
      '</ul></div>';
  }

  async renderHtml(markdown, overrides = {}) {
    const options = { ...this.options, ...overrides };
    let { data, content: mdContent } = this.parseFrontmatter(markdown);

    // Generate TOC if requested or if [TOC] placeholder exists
    let tocHtml = '';
    if (options.toc || mdContent.includes('[TOC]')) {
      tocHtml = this.generateToc(mdContent);
      if (mdContent.includes('[TOC]')) {
        mdContent = mdContent.replace('[TOC]', tocHtml);
        tocHtml = ''; // Don't add it twice
      }
    }

    // Replace PAGE_BREAK comments
    const processedMd = mdContent.replace(/<!--\s*PAGE_BREAK\s*-->/g, '<div class="page-break"></div>');
    
    let htmlContent = await this.marked.parse(processedMd);
    if (tocHtml) {
      htmlContent = tocHtml + htmlContent;
    }

    const defaultCssPath = join(__dirname, 'styles/default.css');
    const defaultCss = await readFile(defaultCssPath, 'utf-8');
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
        let template = await readFile(options.template, 'utf-8');
        return template
          .replace('{{title}}', title)
          .replace('{{base}}', basePath)
          .replace('{{css}}', defaultCss + '\n' + extraCss)
          .replace('{{content}}', htmlContent);
      } catch (e) {
        console.warn(`Failed to load template: ${e.message}. Using default.`);
      }
    }
    
    // Basic HTML template with MathJax
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${basePath}
  <title>${title}</title>
  <style>
    ${defaultCss}
    ${extraCss}
  </style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
      },
      options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
      },
      svg: {
        fontCache: 'global'
      }
    };
  </script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
  <div class="markdown-body">
    ${htmlContent}
  </div>
</body>
</html>`;
  }

    async generatePdf(markdown, outputPath, overrides = {}) {

      const html = await this.renderHtml(markdown, overrides);

      const options = { ...this.options, ...overrides };

      

      const browser = await puppeteer.launch({

        headless: 'new',

        args: ['--no-sandbox', '--disable-setuid-sandbox']

      });

      

      const page = await browser.newPage();

      await page.setContent(html, { waitUntil: 'networkidle0' });

      

      // Wait for MathJax to finish rendering

      await page.evaluate(async () => {

        if (window.MathJax && window.MathJax.typesetPromise) {

          await window.MathJax.typesetPromise();

        }

      });

  

          await page.pdf({

  

            path: outputPath,

  

            format: 'A4',

  

            margin: {

  

              top: options.margin || '20mm',

  

              right: options.margin || '20mm',

  

              bottom: options.margin || '20mm',

  

              left: options.margin || '20mm'

  

            },

  

            printBackground: true,

  

            displayHeaderFooter: !!(options.headerTemplate || options.footerTemplate),

  

            headerTemplate: options.headerTemplate || '<span></span>',

  

            footerTemplate: options.footerTemplate || '<span></span>'

  

          });

  

      

  

      await browser.close();

    }

  }

  