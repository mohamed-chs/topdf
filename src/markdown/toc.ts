import { Marked } from 'marked';
import type { CustomToken, TocHeading } from '../types.js';
import { normalizeTocDepth } from '../utils/validation.js';

const stripNestedAnchors = (value: string): string =>
  value.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1');

export const generateToc = (tokens: CustomToken[], depthInput?: number): string => {
  const depth = normalizeTocDepth(depthInput);
  const headings: TocHeading[] = [];
  const inlineParser = new Marked();

  const walk = (items: CustomToken[]): void => {
    for (const token of items) {
      if (token.type === 'heading' && token.depth !== undefined && token.depth <= depth) {
        headings.push({
          level: token.depth,
          text: inlineParser.parseInline(token.text ?? '') as string,
          id: token.id ?? ''
        });
      }

      if (token.tokens?.length) walk(token.tokens);
    }
  };

  walk(tokens);
  if (!headings.length) return '';

  const listItems = headings
    .map(
      (heading) =>
        `<li class="toc-level-${heading.level}"><a href="#${heading.id}">${stripNestedAnchors(heading.text)}</a></li>`
    )
    .join('\n');

  return `<div class="toc"><h2>Table of Contents</h2><ul>${listItems}</ul></div>`;
};
