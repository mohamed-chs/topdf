const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);

export const sanitizeHref = (href: string): string => {
  const trimmed = href.trim();
  if (!trimmed) return '#';
  if (trimmed.startsWith('#')) return trimmed;
  if (trimmed.startsWith('//')) return '#';

  // Allow relative links and common safe protocols only.
  if (/^(\/(?!\/)|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z\d+\-.]*:/i.test(trimmed)) return trimmed;

  return '#';
};
