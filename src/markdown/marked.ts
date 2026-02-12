import { Marked } from 'marked';
import type { Token, Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import footnote from 'marked-footnote';
import hljs from 'highlight.js';
import GithubSlugger from 'github-slugger';
import { escapeHtml, sanitizeHref } from '../utils/html.js';
import type { CustomToken } from '../types.js';

const stripHtml = (value: string): string => value.replace(/<[^>]+>/g, '').trim();
const stripMarkdownLinks = (value: string): string => value.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

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
      ],
      renderer: {
        link(token: Tokens.Link) {
          const href = token.href?.trim();
          const title = token.title?.trim();
          const text = token.text ?? '';

          if (!href) return text;

          const external = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(href);
          const rewrittenHref = !external && href.toLowerCase().endsWith('.md') ? href.replace(/\.md$/i, '.pdf') : href;
          const safeHref = sanitizeHref(rewrittenHref);

          let output = `<a href="${escapeHtml(safeHref)}"`;
          if (title) output += ` title="${escapeHtml(title)}"`;
          output += `>${text}</a>`;
          return output;
        }
      }
    });

  marked.setOptions({ gfm: true, breaks: true });
  return marked;
};
