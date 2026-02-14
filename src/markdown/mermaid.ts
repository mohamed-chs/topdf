const MERMAID_FENCE_LINE_PATTERN = /^( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[^\r\n]*)$/m;

export const hasMermaidSyntax = (content: string): boolean =>
  MERMAID_FENCE_LINE_PATTERN.test(content);
