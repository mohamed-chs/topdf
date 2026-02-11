import type { Token, Tokens } from 'marked';

export type PaperFormat = 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';

export interface RendererOptions {
  margin?: string;
  format?: PaperFormat | string;
  toc?: boolean;
  tocDepth?: number;
  math?: boolean;
  customCss?: string | null;
  template?: string | null;
  headerTemplate?: string | null;
  footerTemplate?: string | null;
  basePath?: string;
  title?: string;
}

export interface Frontmatter {
  title?: string;
  tocDepth?: number;
  [key: string]: unknown;
}

export interface TocHeading {
  level: number;
  text: string;
  id: string;
}

export interface RenderResult {
  data: Frontmatter;
  content: string;
}

// We use a custom type for tokens that might have our extensions
export type MarkdownToken = (Token | { type: 'pageBreak'; raw: string } | { type: 'tocPlaceholder'; raw: string }) & {
  id?: string;
  tokens?: MarkdownToken[];
  depth?: number;
  text?: string;
};

// Actually, it's better to use type guards or casts.
// Let's refine MarkdownToken to be more usable without any.
export type CustomToken = Tokens.Generic & {
  id?: string;
  tokens?: CustomToken[];
  depth?: number;
  text?: string;
};