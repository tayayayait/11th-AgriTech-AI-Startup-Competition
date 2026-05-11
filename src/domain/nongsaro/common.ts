export function normalizeNongsaroUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw, "https://www.nongsaro.go.kr");
    if (url.protocol === "http:" && ["www.nongsaro.go.kr", "nongsaro.go.kr"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    if (raw.startsWith("/")) return `https://www.nongsaro.go.kr${raw}`;
    return `https://www.nongsaro.go.kr/${raw}`;
  }
}

export function pickLatestYearFromItems(items: Array<Record<string, string>>): string {
  const years = items
    .map((item) => item.yearCode ?? item.yearVal ?? "")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  if (years.length === 0) {
    return new Date().getFullYear().toString();
  }

  return Math.trunc(years[0]).toString();
}
