export type KmaForecastType = "ultraSrtNcst" | "ultraSrtFcst" | "vilageFcst";

export interface KmaBaseDateTime {
  baseDate: string;
  baseTime: string;
}

export interface KmaGridPoint {
  nx: number;
  ny: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function toPseudoKstDate(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function fromPseudoKstDate(date: Date): Date {
  return new Date(date.getTime() - KST_OFFSET_MS);
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatBaseDateTime(date: Date): KmaBaseDateTime {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());

  return {
    baseDate: `${year}${month}${day}`,
    baseTime: `${hour}${minute}`,
  };
}

function resolveUltraSrtNcst(nowKst: Date): KmaBaseDateTime {
  const currentHour = new Date(nowKst);
  currentHour.setUTCMinutes(0, 0, 0);
  const availableAt = new Date(currentHour.getTime() + TEN_MINUTES_MS);
  const base = nowKst >= availableAt ? currentHour : new Date(currentHour.getTime() - ONE_HOUR_MS);
  return formatBaseDateTime(base);
}

function resolveUltraSrtFcst(nowKst: Date): KmaBaseDateTime {
  const currentHour = new Date(nowKst);
  currentHour.setUTCMinutes(30, 0, 0);
  const availableAt = new Date(currentHour.getTime() + FIFTEEN_MINUTES_MS);
  const base = nowKst >= availableAt ? currentHour : new Date(currentHour.getTime() - ONE_HOUR_MS);
  return formatBaseDateTime(base);
}

const VILAGE_FCST_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const;

function resolveVilageFcst(nowKst: Date): KmaBaseDateTime {
  const candidates = VILAGE_FCST_BASE_HOURS.map((hour) => {
    const base = new Date(nowKst);
    base.setUTCHours(hour, 0, 0, 0);
    const availableAt = new Date(base.getTime() + TEN_MINUTES_MS);
    return { base, availableAt };
  });

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const { base, availableAt } = candidates[index];
    if (nowKst >= availableAt) {
      return formatBaseDateTime(base);
    }
  }

  const previousDay = new Date(nowKst);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  previousDay.setUTCHours(23, 0, 0, 0);
  return formatBaseDateTime(previousDay);
}

export function resolveKmaBaseDateTime(
  forecastType: KmaForecastType,
  now = new Date(),
): KmaBaseDateTime {
  const nowKst = toPseudoKstDate(now);

  if (forecastType === "ultraSrtNcst") return resolveUltraSrtNcst(nowKst);
  if (forecastType === "ultraSrtFcst") return resolveUltraSrtFcst(nowKst);
  return resolveVilageFcst(nowKst);
}

export function getNowKstIsoString(now = new Date()): string {
  const pseudoKst = toPseudoKstDate(now);
  const utc = fromPseudoKstDate(pseudoKst);
  return utc.toISOString();
}

// 기상청 DFS(LCC) 위경도 -> 격자 변환
export function toKmaGrid(lat: number, lng: number): KmaGridPoint {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (sf ** sn * Math.cos(slat1)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / ro ** sn;

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / ra ** sn;

  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

function normalizeNumericValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value >= 900 || value <= -900) return null;
    return value;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "null") return null;

  const extracted = trimmed.match(/-?\d+(\.\d+)?/g);
  if (!extracted || extracted.length === 0) return null;

  const last = Number(extracted[extracted.length - 1]);
  if (!Number.isFinite(last)) return null;
  if (last >= 900 || last <= -900) return null;
  return last;
}

export function normalizeKmaTemperature(value: unknown): number | null {
  return normalizeNumericValue(value);
}

export function normalizeKmaHumidity(value: unknown): number | null {
  return normalizeNumericValue(value);
}

export function normalizeKmaWind(value: unknown): number | null {
  return normalizeNumericValue(value);
}

export function normalizeKmaPrecipitation(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return normalizeNumericValue(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.includes("강수없음") || trimmed === "없음") return 0;

  if (trimmed.includes("미만")) {
    const numberPart = normalizeNumericValue(trimmed);
    if (numberPart === null) return 0;
    return Math.max(0.1, numberPart * 0.5);
  }

  if (trimmed.includes("이상")) {
    const numberPart = normalizeNumericValue(trimmed);
    if (numberPart === null) return null;
    return numberPart;
  }

  if (trimmed.includes("~")) {
    const numbers = trimmed.match(/\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 2) return normalizeNumericValue(trimmed);
    const first = Number(numbers[0]);
    const second = Number(numbers[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    return (first + second) / 2;
  }

  return normalizeNumericValue(trimmed);
}

export interface KmaItemLike {
  category?: unknown;
  obsrValue?: unknown;
  fcstValue?: unknown;
}

export function extractKmaItems(rawData: unknown): KmaItemLike[] {
  if (!rawData || typeof rawData !== "object") return [];
  const root = rawData as Record<string, unknown>;

  const response = root.response;
  if (!response || typeof response !== "object") return [];

  const body = (response as Record<string, unknown>).body;
  if (!body || typeof body !== "object") return [];

  const items = (body as Record<string, unknown>).items;
  if (!items || typeof items !== "object") return [];

  const itemArray = (items as Record<string, unknown>).item;
  if (!Array.isArray(itemArray)) return [];
  return itemArray as KmaItemLike[];
}

function readKmaHeader(rawData: unknown): { resultCode: string; resultMsg: string } {
  if (!rawData || typeof rawData !== "object") return { resultCode: "", resultMsg: "" };
  const response = (rawData as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return { resultCode: "", resultMsg: "" };
  const header = (response as Record<string, unknown>).header;
  if (!header || typeof header !== "object") return { resultCode: "", resultMsg: "" };

  const source = header as Record<string, unknown>;
  return {
    resultCode: typeof source.resultCode === "string" ? source.resultCode : "",
    resultMsg: typeof source.resultMsg === "string" ? source.resultMsg : "",
  };
}

export function parseKmaItems(rawData: unknown): KmaItemLike[] {
  const { resultCode, resultMsg } = readKmaHeader(rawData);

  if (resultCode && resultCode !== "00") {
    throw new Error(resultMsg ? `기상청 API 오류: ${resultMsg}` : `기상청 API 오류 코드: ${resultCode}`);
  }

  return extractKmaItems(rawData);
}

export interface KmaWeatherSnapshot {
  temperature: number | null;
  precipitation: number | null;
  wind: number | null;
  humidity: number | null;
}

export function summarizeKmaWeather(items: KmaItemLike[]): KmaWeatherSnapshot {
  const summary: KmaWeatherSnapshot = {
    temperature: null,
    precipitation: null,
    wind: null,
    humidity: null,
  };

  for (const item of items) {
    const category = typeof item.category === "string" ? item.category : "";
    const value = item.obsrValue ?? item.fcstValue;

    if (!category) continue;

    if ((category === "T1H" || category === "TMP") && summary.temperature === null) {
      summary.temperature = normalizeKmaTemperature(value);
      continue;
    }

    if ((category === "RN1" || category === "PCP") && summary.precipitation === null) {
      summary.precipitation = normalizeKmaPrecipitation(value);
      continue;
    }

    if (category === "WSD" && summary.wind === null) {
      summary.wind = normalizeKmaWind(value);
      continue;
    }

    if (category === "REH" && summary.humidity === null) {
      summary.humidity = normalizeKmaHumidity(value);
    }
  }

  return summary;
}
