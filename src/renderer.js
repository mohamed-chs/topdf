import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import GithubSlugger from 'github-slugger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFile(join(__dirname, p), 'utf-8');
const [DEFAULT_CSS, HIGHLIGHT_CSS] = await Promise.all([read('styles/default.css'), read('styles/github.css')]);

export class Renderer {
  constructor(options = {}) {
    this.options = { margin: '20mm', format: 'A4', ...options };
    this.browser = this.page = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      this.page = await this.browser.newPage();
    }
  }

  async close() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
    this.page = this.browser = null;
  }

  parseFrontmatter(md) {
    const m = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (!m) return { data: {}, content: md };
    try { return { data: yaml.load(m[1]) || {}, content: md.replace(m[0], '') }; }
    catch (e) { console.warn('Frontmatter error:', e.message); return { data: {}, content: md }; }
  }

  generateToc(tokens, depth = 6) {
    const headings = [], marked = new Marked();
    const walk = (items) => {
      for (const t of items) {
        if (t.type === 'heading' && t.depth <= depth) {
          headings.push({
            level: t.depth,
            text: marked.parseInline(t.text.trim()),
            id: t.id
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

  createMarkedInstance(slugger) {
    const instance = new Marked()
      .use(markedHighlight({ 
        langPrefix: 'hljs language-', 
        highlight: (c, l) => hljs.highlight(c, { language: hljs.getLanguage(l) ? l : 'plaintext' }).value 
      }))
      .use(footnote())
      .use(gfmHeadingId())
      .use({
        walkTokens(token) {
          if (token.type === 'heading' && !token.id && slugger) {
            token.id = slugger.slug(token.text.replace(/<.*?>/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'));
          }
        },
        extensions: [
          {
            name: 'pageBreak',
            level: 'block',
            start(src) { return src.match(/<!--\s*PAGE_BREAK\s*-->/)?.index; },
            tokenizer(src) {
              const cap = /^<!--\s*PAGE_BREAK\s*-->/.exec(src);
              if (cap) return { type: 'pageBreak', raw: cap[0] };
            },
            renderer() { return '<div class="page-break"></div>'; }
          },
          {
            name: 'tocPlaceholder',
            level: 'block',
            start(src) { return src.match(/\[TOC\]/i)?.index; },
            tokenizer(src) {
              const cap = /^\[TOC\]/i.exec(src);
              if (cap) return { type: 'tocPlaceholder', raw: cap[0] };
            },
            renderer() { return '[[TOC_PLACEHOLDER]]'; }
          }
        ],
        renderer: {
          link({ href, title, text }) {
            const isExternal = /^(?:[a-z+]+:)?\/\//i.test(href);
            const newHref = (!isExternal && href.toLocaleLowerCase().endsWith('.md')) 
              ? href.replace(/\.md$/i, '.pdf') 
              : href;
            let out = `<a href="${newHref}"`;
            if (title) out += ` title="${title}"`;
            out += `>${text}</a>`;
            return out;
          }
        }
      }).setOptions({ gfm: true, breaks: true });
    return instance;
  }

  async renderHtml(md, overrides = {}) {
    const opts = { ...this.options, ...overrides };
    const { data, content } = this.parseFrontmatter(md);
    const slugger = new GithubSlugger();
    const marked = this.createMarkedInstance(slugger);
    const tokens = marked.lexer(content);
    
    // Populate IDs for TOC
    const walk = (items) => {
      for (const t of items) {
        if (t.type === 'heading' && !t.id) {
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
      tokens.push(footnoteToken);
    }

    const tocDepth = data.tocDepth || opts.tocDepth || 6;
    const hasTocPlaceholder = tokens.some(t => t.type === 'tocPlaceholder');
    const tocHtml = (opts.toc || hasTocPlaceholder) ? this.generateToc(tokens, tocDepth) : '';
    let html = marked.parser(tokens);
    
    if (tocHtml) {
      if (html.includes('[[TOC_PLACEHOLDER]]')) {
        html = html.replace('[[TOC_PLACEHOLDER]]', tocHtml);
      } else if (opts.toc && !hasTocPlaceholder) {
        html = tocHtml + html;
      }
    }

    const css = `${DEFAULT_CSS}\n${HIGHLIGHT_CSS}\n${opts.customCss ? await readFile(opts.customCss, 'utf-8').catch(() => '') : ''}`;
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
    return (tpl || `<!DOCTYPE html><html><head><meta charset="UTF-8">{{base}}<title>{{title}}</title><style>{{css}}</style>{{mathjax}}</head><body class="markdown-body">{{content}}</body></html>`)
      .replace(/{{title}}/g, () => overrides.title || data.title || 'Markdown Document')
      .replace(/{{base}}/g, () => base).replace(/{{css}}/g, () => css).replace(/{{content}}/g, () => html).replace(/{{mathjax}}/g, () => math);
  }

  async generatePdf(md, outputPath, overrides = {}) {
    const opts = { ...this.options, ...overrides };
    const html = await this.renderHtml(md, opts);
    await this.init();
    try {
      await this.page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.evaluate(async () => {
        // Wait for images
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
            setTimeout(resolve, 5000); // Max 5s per image
          });
        }));

        // Wait for MathJax
        if (!document.getElementById('MathJax-script')) return;
        await new Promise(r => {
          const check = () => { if (window.MathJax?.typesetPromise) r(); else setTimeout(check, 100); };
          check();
          setTimeout(r, 10000);
        });
        await window.MathJax.typesetPromise().catch(() => {});
      });

      const marginParts = String(opts.margin).split(/\s+/).filter(Boolean);
      const m = { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' };
      if (marginParts.length === 1) {
        m.top = m.right = m.bottom = m.left = marginParts[0];
      } else if (marginParts.length === 2) {
        m.top = m.bottom = marginParts[0];
        m.right = m.left = marginParts[1];
      } else if (marginParts.length === 3) {
        m.top = marginParts[0];
        m.right = m.left = marginParts[1];
        m.bottom = marginParts[2];
      } else if (marginParts.length >= 4) {
        m.top = marginParts[0];
        m.right = marginParts[1];
        m.bottom = marginParts[2];
        m.left = marginParts[3];
      }

      await this.page.pdf({
        path: outputPath, format: opts.format, printBackground: true,
        margin: m,
        displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
        headerTemplate: opts.headerTemplate || '<span></span>', 
        footerTemplate: opts.footerTemplate || '<div style="font-size: 10px; width: 100%; text-align: center; color: #666;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });
    } catch (e) { if (e.message.includes('Session closed')) this.page = null; throw e; }
  }
}
