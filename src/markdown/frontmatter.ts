import yaml from 'js-yaml';
import type { Frontmatter, FrontmatterParseResult } from '../types.js';

const FRONTMATTER_PATTERN = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/;

const normalizeFrontmatter = (value: unknown): Frontmatter => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Frontmatter;
};

export const parseFrontmatter = (markdown: string): FrontmatterParseResult => {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) return { data: {}, content: markdown, warnings: [] };

  const source = match[1] ?? '';
  if (!source.trim()) {
    return {
      data: {},
      content: markdown.slice(match[0].length),
      warnings: []
    };
  }

  try {
    const parsed = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    return {
      data: normalizeFrontmatter(parsed),
      content: markdown.slice(match[0].length),
      warnings: []
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {},
      content: markdown,
      warnings: [`Frontmatter parsing failed: ${message}`]
    };
  }
};
