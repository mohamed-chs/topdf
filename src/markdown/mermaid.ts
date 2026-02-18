const MERMAID_FENCE_PATTERN =
  /^( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[^\r\n]*)\r?\n[\s\S]*?\r?\n\1\2[ \t]*(?:\r?\n|$)/m;

export const hasMermaidSyntax = (content: string): boolean => MERMAID_FENCE_PATTERN.test(content);
