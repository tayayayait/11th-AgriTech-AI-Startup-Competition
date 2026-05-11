function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function normalizeHtmlText(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const text = decodeBasicHtmlEntities(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\f\v]+\n/g, "\n")
    .replace(/\n[ \t\f\v]+/g, "\n")
    .replace(/[ \t\f\v]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}

export function normalizeHtmlSingleLineText(value: string | null | undefined): string | null {
  const text = normalizeHtmlText(value);
  if (!text) return null;

  const singleLine = text
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t\f\v]{2,}/g, " ")
    .trim();

  return singleLine || null;
}
