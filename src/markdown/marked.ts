import { Marked } from 'marked';
import type { Token } from 'marked';
import type { Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import type GithubSlugger from 'github-slugger';
import { sanitizeHref } from '../utils/html.js';
import type { CustomToken } from '../types.js';

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
const rewriteMarkdownHref = (href: string): string => {
  const { path, suffix } = splitUrlSuffix(href);
  if (/\.markdown$/i.test(path)) return `${path.replace(/\.markdown$/i, '.pdf')}${suffix}`;
  if (/\.md$/i.test(path)) return `${path.replace(/\.md$/i, '.pdf')}${suffix}`;
  return href;
};

export const createMarkedInstance = (slugger: GithubSlugger): Marked => {
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
    .use(gfmHeadingId())
    .use({
      walkTokens(token: Token) {
        const current = token as CustomToken;
        if (current.type === 'heading' && !current.id && current.text) {
          current.id = slugger.slug(stripMarkdownLinks(stripHtml(current.text)));
        }
        if (current.type === 'link') {
          const link = current as unknown as Tokens.Link;
          const href = typeof link.href === 'string' ? link.href.trim() : '';
          if (!href) return;
          const rewrittenHref = EXTERNAL_LINK.test(href) ? href : rewriteMarkdownHref(href);
          link.href = sanitizeHref(rewrittenHref);
        }
      },
      extensions: [
        {
          name: 'pageBreak',
          level: 'block',
          start(source: string) {
            return source.match(/<!--\s*PAGE_BREAK\s*-->/)?.index;
          },
          tokenizer(source: string) {
            const match = /^<!--\s*PAGE_BREAK\s*-->/.exec(source);
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
