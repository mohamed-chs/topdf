import { randomBytes } from 'crypto';

export interface MathProtectionResult {
  text: string;
  restore: (html: string) => string;
  restoreHtml: (html: string) => string;
}

const replaceWithPlaceholders = (
  input: string,
  pattern: RegExp,
  keyPrefix: string,
  store: Map<string, string>
): string =>
  input.replace(pattern, (match) => {
    const id = `${keyPrefix}_${randomBytes(6).toString('hex')}`;
    store.set(id, match);
    return id;
  });

export const protectMath = (content: string): MathProtectionResult => {
  const codeGuards = new Map<string, string>();
  const mathGuards = new Map<string, string>();
  const escapedDollarGuards = new Map<string, string>();

  // Fence guards first so we never interpret math inside code blocks.
  let text = replaceWithPlaceholders(
    content,
    /^( {0,3})(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?\r?\n\1\2[ \t]*$/gm,
    'CODE_FENCE',
    codeGuards
  );

  // Inline code spans can still contain things that look like LaTeX.
  text = replaceWithPlaceholders(text, /(`+)([^`\n]|`(?!\1))+?\1/g, 'CODE_SPAN', codeGuards);

  // Display math blocks.
  text = replaceWithPlaceholders(
    text,
    /^\$\$[ \t]*\r?\n[\s\S]*?\r?\n\$\$[ \t]*$/gm,
    'MATH_BLOCK',
    mathGuards
  );
  text = replaceWithPlaceholders(
    text,
    /^\\\[[ \t]*\r?\n[\s\S]*?\r?\n\\\][ \t]*$/gm,
    'MATH_BLOCK',
    mathGuards
  );
  text = replaceWithPlaceholders(text, /\$\$[^\n]+?\$\$/g, 'MATH_INLINE', mathGuards);
  text = replaceWithPlaceholders(text, /\\\[[^\n]*?\\\]/g, 'MATH_INLINE', mathGuards);

  // Inline math.
  text = replaceWithPlaceholders(text, /\\\([^\n]*?\\\)/g, 'MATH_INLINE', mathGuards);
  text = replaceWithPlaceholders(
    text,
    /(?<!\\)\$(?!\s)([^\n$]|\\\$)+?(?<!\s)(?<!\\)\$/g,
    'MATH_INLINE',
    mathGuards
  );

  // Escaped dollars should render as a literal "$", but must never become MathJax delimiters.
  text = replaceWithPlaceholders(text, /\\\$/g, 'ESCAPED_DOLLAR', escapedDollarGuards);

  // Restore code guards before lexing markdown.
  for (const [id, code] of codeGuards) {
    text = text.split(id).join(code);
  }

  const restore = (html: string): string => {
    let output = html;
    for (const [id, original] of mathGuards) {
      output = output.split(id).join(original);
    }
    for (const id of escapedDollarGuards.keys()) {
      output = output.split(id).join('$');
    }
    return output;
  };

  const restoreHtml = (html: string): string => {
    let output = html;
    for (const [id, original] of mathGuards) {
      output = output.split(id).join(original);
    }
    for (const id of escapedDollarGuards.keys()) {
      output = output
        .split(id)
        .join('<span class="convpdf-math-ignore" aria-hidden="true">&#36;</span>');
    }
    return output;
  };

  return { text, restore, restoreHtml };
};

export const hasMathSyntax = (content: string): boolean => {
  const sanitized = content
    .replace(/^( {0,3})(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?\r?\n\1\2[ \t]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/\[([^\]]*)\]\([^\)]+\)/g, '$1');

  return /(?<!\\)\$[^$\n]+\$|(?<!\\)\$\$[\s\S]+?\$\$|\\\([^\n]+?\\\)|\\\[[\s\S]+?\\\]/.test(
    sanitized
  );
};
