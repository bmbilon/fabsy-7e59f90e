export function faqAnswerHtml(raw: string): string {
  if (!raw) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;

  return raw
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
