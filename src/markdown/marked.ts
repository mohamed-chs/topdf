import { Marked } from 'marked';
import type { Token } from 'marked';
import type { Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import type GithubSlugger from 'github-slugger';
import { escapeHtml, sanitizeHref } from '../utils/html.js';
import type { CustomToken, OutputFormat } from '../types.js';

const stripHtml = (value: string): string => value.replace(/<[^>]+>/g, '').trim();
const stripMarkdownLinks = (value: string): string =>
  value.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
const EXTERNAL_LINK = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;
const splitUrlSuffix = (href: string): { path: string; suffix: string } => {
  const hashIndex = href.indexOf('#');
  const queryIndex = href.indexOf('?');
  const cutIndex =
    hashIndex === -1 ? queryIndex : queryIndex === -1 ? hashIndex : Math.min(hashIndex, queryIndex);
  if (cutIndex === -1) return { path: href, suffix: '' };
  return { path: href.slice(0, cutIndex), suffix: href.slice(cutIndex) };
};
const rewriteMarkdownHref = (href: string, outputFormat: OutputFormat): string => {
  const { path, suffix } = splitUrlSuffix(href);
  if (/\.markdown$/i.test(path)) {
    return `${path.replace(/\.markdown$/i, `.${outputFormat}`)}${suffix}`;
  }
  if (/\.md$/i.test(path)) return `${path.replace(/\.md$/i, `.${outputFormat}`)}${suffix}`;
  return href;
};
const MERMAID_FENCE_PATTERN =
  /^( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[^\r\n]*)\r?\n([\s\S]*?)\r?\n\1\2[ \t]*(?:\r?\n|$)/;
const CALLOUT_HEADER_PATTERN = /^\[!([a-z][a-z0-9_-]*)\]([+-])?[ \t]*([^\r\n]*?)[ \t]*$/i;
const BLOCKQUOTE_LINE_PATTERN = /^( {0,3})>[ \t]?([^\r\n]*)(?:\r?\n|$)/;

const CALLOUT_TITLE_MAP: Readonly<Record<string, string>> = {
  note: 'Note',
  abstract: 'Abstract',
  info: 'Info',
  todo: 'Todo',
  tip: 'Tip',
  success: 'Success',
  question: 'Question',
  warning: 'Warning',
  failure: 'Failure',
  danger: 'Danger',
  bug: 'Bug',
  example: 'Example',
  quote: 'Quote',
  important: 'Important',
  caution: 'Caution'
};

const CALLOUT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  summary: 'abstract',
  tldr: 'abstract',
  faq: 'question',
  help: 'question',
  error: 'danger'
};

const normalizeCalloutType = (rawType: string): string => {
  const normalized = rawType.toLowerCase();
  return CALLOUT_TYPE_ALIASES[normalized] ?? normalized;
};

const toCalloutDefaultTitle = (calloutType: string): string =>
  CALLOUT_TITLE_MAP[calloutType] ??
  calloutType
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');

export const createMarkedInstance = (
  slugger: GithubSlugger,
  outputFormat: OutputFormat = 'pdf'
): Marked => {
  const marked = new Marked()
    .use(
      markedHighlight({
        langPrefix: 'hljs language-',
        highlight: (code, languageHint) => {
          const language = hljs.getLanguage(languageHint) ? languageHint : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
      })
    )
    .use(footnote())
    .use({
      renderer: {
        heading(this: { parser: { parseInline: (tokens: Token[]) => string } }, token: Token) {
          const heading = token as Tokens.Heading & { id?: string };
          const text = this.parser.parseInline(heading.tokens);
          if (!heading.id) return `<h${heading.depth}>${text}</h${heading.depth}>\n`;
          return `<h${heading.depth} id="${escapeHtml(heading.id)}">${text}</h${heading.depth}>\n`;
        }
      },
      walkTokens(token: Token) {
        const current = token as CustomToken;
        if (current.type === 'heading' && current.text) {
          current.id = slugger.slug(stripMarkdownLinks(stripHtml(current.text)));
        }
        if (current.type === 'link') {
          const link = current as unknown as Tokens.Link;
          const href = typeof link.href === 'string' ? link.href.trim() : '';
          if (!href) return;
          const rewrittenHref = EXTERNAL_LINK.test(href)
            ? href
            : rewriteMarkdownHref(href, outputFormat);
          link.href = sanitizeHref(rewrittenHref);
        }
      },
      extensions: [
        {
          name: 'callout',
          level: 'block',
          childTokens: ['titleTokens', 'tokens'],
          start(source: string) {
            return source.match(/^ {0,3}>[ \t]*\[![a-z][a-z0-9_-]*\]/im)?.index;
          },
          tokenizer(source: string) {
            const lines: string[] = [];
            let raw = '';
            let remainder = source;

            while (true) {
              const lineMatch = BLOCKQUOTE_LINE_PATTERN.exec(remainder);
              if (!lineMatch) break;

              const [lineRaw, , lineContent = ''] = lineMatch;
              lines.push(lineContent);
              raw += lineRaw;
              remainder = remainder.slice(lineRaw.length);
            }

            const header = lines[0] ? CALLOUT_HEADER_PATTERN.exec(lines[0]) : null;
            if (!header) return undefined;

            const calloutType = normalizeCalloutType(header[1] ?? '');
            const foldMarker = header[2] ?? '';
            const customTitle = header[3]?.trim() ?? '';
            const calloutTitle = customTitle || toCalloutDefaultTitle(calloutType);
            const contentMarkdown = lines.slice(1).join('\n');

            return {
              type: 'callout',
              raw,
              calloutType,
              calloutTitle,
              collapsed: foldMarker === '-',
              titleTokens: this.lexer.inlineTokens(calloutTitle),
              tokens: this.lexer.blockTokens(contentMarkdown)
            };
          },
          renderer(token: Token) {
            const callout = token as Token & {
              calloutType?: string;
              collapsed?: boolean;
              titleTokens?: Token[];
              tokens?: Token[];
            };

            const calloutType = callout.calloutType ?? 'note';
            const calloutClasses = ['callout', `callout-${calloutType}`];
            if (callout.collapsed) {
              calloutClasses.push('callout-collapsed');
            }

            const titleHtml = this.parser.parseInline(callout.titleTokens ?? []);
            const contentHtml = this.parser.parse(callout.tokens ?? []);
            return `<div class="${calloutClasses.join(' ')}" data-callout="${escapeHtml(calloutType)}"><div class="callout-title">${titleHtml}</div><div class="callout-content">${contentHtml}</div></div>\n`;
          }
        },
        {
          name: 'mermaid',
          level: 'block',
          start(source: string) {
            return source.match(/ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid(?:[^\r\n]*)\r?\n/)?.index;
          },
          tokenizer(source: string) {
            const match = MERMAID_FENCE_PATTERN.exec(source);
            if (!match) return undefined;
            return {
              type: 'mermaid',
              raw: match[0],
              text: match[3] ?? ''
            };
          },
          renderer(token: Token & { text?: string }) {
            return `<div class="mermaid">${escapeHtml(token.text ?? '')}</div>\n`;
          }
        },
        {
          name: 'pageBreak',
          level: 'block',
          start(source: string) {
            return source.match(/^ {0,3}<!--\s*PAGE_BREAK\s*-->[ \t]*(?:\r?\n|$)/m)?.index;
          },
          tokenizer(source: string) {
            const match = /^ {0,3}<!--\s*PAGE_BREAK\s*-->[ \t]*(?:\r?\n|$)/.exec(source);
            if (!match) return undefined;
            return { type: 'pageBreak', raw: match[0] };
          },
          renderer() {
            return '<div class="page-break"></div>';
          }
        },
        {
          name: 'tocPlaceholder',
          level: 'block',
          start(source: string) {
            return source.match(/^\[TOC\]/im)?.index;
          },
          tokenizer(source: string) {
            const match = /^\[TOC\]/i.exec(source);
            if (!match) return undefined;
            return { type: 'tocPlaceholder', raw: match[0] };
          },
          renderer() {
            return '[[TOC_PLACEHOLDER]]';
          }
        }
      ]
    });

  marked.setOptions({ gfm: true, breaks: true });
  return marked;
};
