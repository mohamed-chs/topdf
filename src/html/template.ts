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
  includeMathJax: boolean;
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
  </head>
  <body class="markdown-body">
    {{content}}
  </body>
</html>`;

const MATHJAX_SNIPPET = `
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
      displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
    },
    svg: { fontCache: 'global' },
    options: { enableErrorOutputs: false }
  };
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

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
  const baseTag = input.basePath
    ? `<base href="${escapeHtml(pathToFileURL(resolve(input.basePath)).href)}/">`
    : '';
  const mathJax = input.includeMathJax ? MATHJAX_SNIPPET : '';

  let html = template;
  html = replaceToken(html, 'title', escapeHtml(input.title));
  html = replaceToken(html, 'base', baseTag);
  html = replaceToken(html, 'css', input.css);
  html = replaceToken(html, 'content', input.content);
  html = replaceToken(html, 'mathjax', mathJax);
  return html;
};
