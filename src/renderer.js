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
    const headings = [], slugger = new GithubSlugger(), marked = new Marked();
    const walk = (items) => {
      for (const t of items) {
        if (t.type === 'heading' && t.depth <= depth) {
          const text = t.text.trim();
          const id = t.id || slugger.slug(text.replace(/<.*?>/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'));
          headings.push({
            level: t.depth,
            text: marked.parseInline(text),
            id: id
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

  createMarkedInstance() {
    return new Marked()
      .use(markedHighlight({ langPrefix: 'hljs language-', highlight: (c, l) => hljs.highlight(c, { language: hljs.getLanguage(l) ? l : 'plaintext' }).value }))
      .use(footnote()).use({
        renderer: {
          heading(token) {
            const text = this.parser.parseInline(token.tokens);
            const level = token.depth;
            const id = token.id;
            return `<h${level} id="${id}">${text}</h${level}>\n`;
          }
        }
      }).setOptions({ gfm: true, breaks: true });
  }

  async renderHtml(md, overrides = {}) {
    const opts = { ...this.options, ...overrides };
    const { data, content: raw } = this.parseFrontmatter(md);
    const content = raw.replace(/<!--\s*PAGE_BREAK\s*-->/g, '<div class="page-break"></div>');
    const slugger = new GithubSlugger();
    const tokens = new Marked().use(footnote()).lexer(content);
    const walk = (items) => {
      for (const t of items) {
        if (t.type === 'heading') t.id = slugger.slug(t.text.replace(/<.*?>/g, '').replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').trim());
        if (t.tokens) walk(t.tokens);
      }
    };
    walk(tokens);

    const tocDepth = data.tocDepth || opts.tocDepth || 6;
    const tocHtml = (opts.toc || /\[TOC\]/i.test(content)) ? this.generateToc(tokens, tocDepth) : '';
    let html = this.createMarkedInstance().parser(tokens);
    
    if (tocHtml) {
      if (/\[TOC\]/i.test(html)) {
        html = html.replace(/\[TOC\]/gi, tocHtml);
      } else if (opts.toc) {
        html = tocHtml + html;
      }
    }

    const css = `${DEFAULT_CSS}\n${HIGHLIGHT_CSS}\n${opts.customCss ? await readFile(opts.customCss, 'utf-8').catch(() => '') : ''}`;
    const base = opts.basePath ? `<base href="${pathToFileURL(resolve(opts.basePath)).href}/">` : '';
    
    const contentNoCode = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    const math = (opts.math !== false && /(?<!\\)\$[^$\s][^$]*[^$\s]\$|(?<!\\)\$[^$\s]\$|(?<!\\)\$\$[\s\S]+\$\$|\\\(|\\\[/.test(contentNoCode)) ? `
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
        if (!document.getElementById('MathJax-script')) return;
        await new Promise(r => {
          const check = () => { if (window.MathJax?.typesetPromise) r(); else setTimeout(check, 100); };
          check();
          setTimeout(r, 10000);
        });
        await window.MathJax.typesetPromise().catch(() => {});
      });
      await this.page.pdf({
        path: outputPath, format: opts.format, printBackground: true,
        margin: { top: opts.margin, right: opts.margin, bottom: opts.margin, left: opts.margin },
        displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
        headerTemplate: opts.headerTemplate || '<span></span>', footerTemplate: opts.footerTemplate || '<span></span>'
      });
    } catch (e) { if (e.message.includes('Session closed')) this.page = null; throw e; }
  }
}
