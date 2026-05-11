const FORBIDDEN_PHRASES = [
  "확진",
  "반드시 방제",
  "이 농약을 사용하세요",
  "병명이 확실합니다",
  "안전합니다",
];

const SAFE_FALLBACK_TEXT = "확실한 정보 없음. 공식 자료 확인 필요";

export function containsForbiddenAiPhrase(text: string): boolean {
  return FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase));
}

export function sanitizeAiText(text: string): string {
  if (!text.trim()) return SAFE_FALLBACK_TEXT;
  return containsForbiddenAiPhrase(text) ? SAFE_FALLBACK_TEXT : text;
}

export function sanitizeAiTextList(items: string[]): string[] {
  return items.map((item) => sanitizeAiText(item));
}
