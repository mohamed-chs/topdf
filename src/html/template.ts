import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { escapeHtml } from '../utils/html.js';

export interface HtmlTemplateInput {
  templatePath?: string | null;
  title: string;
  css: string;
  content: string;
  basePath?: string;
  baseHref?: string;
  includeMathJax: boolean;
  includeMermaid: boolean;
}

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {{base}}
    <title>{{title}}</title>
    <style>{{css}}</style>
    {{mathjax}}
    {{mermaid}}
  </head>
  <body class="markdown-body">
    {{content}}
  </body>
</html>`;

const MATHJAX_SNIPPET = `
<script>
  window.MathJax = {
    options: {
      ignoreHtmlClass: 'convpdf-math-ignore'
    },
    tex: {
      inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
      displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
    },
    svg: { fontCache: 'global' }
  };
</script>
<script id="MathJax-script" defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-chtml.js"></script>`;

const MERMAID_SNIPPET = `
<script id="Mermaid-script" src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  if (window.mermaid && typeof window.mermaid.initialize === 'function') {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  }
</script>`;

const loadTemplate = async (templatePath?: string | null): Promise<string> => {
  if (!templatePath) return DEFAULT_TEMPLATE;
  try {
    return await readFile(resolve(templatePath), 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read template at "${templatePath}": ${message}`);
  }
};

const replaceToken = (template: string, token: string, value: string): string =>
  template.split(`{{${token}}}`).join(value);

export const renderTemplate = async (input: HtmlTemplateInput): Promise<string> => {
  const template = await loadTemplate(input.templatePath);
  const baseTag = input.baseHref
    ? `<base href="${escapeHtml(input.baseHref)}">`
    : input.basePath
      ? `<base href="${escapeHtml(pathToFileURL(resolve(input.basePath)).href)}/">`
      : '';
  const mathJax = input.includeMathJax ? MATHJAX_SNIPPET : '';
  const mermaid = input.includeMermaid ? MERMAID_SNIPPET : '';

  let html = template;
  html = replaceToken(html, 'title', escapeHtml(input.title));
  html = replaceToken(html, 'base', baseTag);
  html = replaceToken(html, 'css', input.css);
  html = replaceToken(html, 'content', input.content);
  html = replaceToken(html, 'mathjax', mathJax);
  html = replaceToken(html, 'mermaid', mermaid);
  return html;
};
