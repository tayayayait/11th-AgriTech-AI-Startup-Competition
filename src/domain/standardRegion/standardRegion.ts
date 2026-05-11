import type { StandardRegionCodeResult, StandardRegionCodeRow, StandardRegionLevel } from "@/domain/standardRegion/types";

function toStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toNumberValue(value: unknown): number | null {
  const text = toStringValue(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(source: Record<string, unknown>, key: string): string | null {
  const entry = Object.entries(source).find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
  return entry ? toStringValue(entry[1]) : null;
}

function collectRegionLikeObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectRegionLikeObjects(item, depth + 1));
  if (typeof value !== "object") return [];

  const source = value as Record<string, unknown>;
  const current = pick(source, "region_cd") && pick(source, "locatadd_nm") ? [source] : [];
  const next = Object.values(source).flatMap((child) => collectRegionLikeObjects(child, depth + 1));
  return [...current, ...next];
}

function collectXmlRows(xml: string): Record<string, unknown>[] {
  return Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/gi)).map((rowMatch) => {
    const row: Record<string, string> = {};
    for (const fieldMatch of rowMatch[1].matchAll(/<([A-Za-z0-9_]+)[^>]*>([\s\S]*?)<\/\1>/g)) {
      row[fieldMatch[1]] = fieldMatch[2].replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").replace(/<[^>]+>/g, "").trim();
    }
    return row;
  });
}

function findFirstValue(value: unknown, key: string, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstValue(item, key, depth + 1);
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const direct = Object.entries(source).find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
  if (direct) return direct[1];

  for (const child of Object.values(source)) {
    const found = findFirstValue(child, key, depth + 1);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function textBetweenTag(raw: string, tagName: string): string | null {
  const match = raw.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? match[1].trim() : null;
}

function parseRawJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeRow(source: Record<string, unknown>): StandardRegionCodeRow | null {
  const regionCode = pick(source, "region_cd");
  const addressName = pick(source, "locatadd_nm");
  if (!regionCode || !/^\d{10}$/.test(regionCode) || !addressName) return null;

  return {
    regionCode,
    sidoCode: pick(source, "sido_cd") ?? regionCode.slice(0, 2),
    sigunguCode: pick(source, "sgg_cd") ?? regionCode.slice(2, 5),
    eupMyeonDongCode: pick(source, "umd_cd") ?? regionCode.slice(5, 8),
    riCode: pick(source, "ri_cd") ?? regionCode.slice(8, 10),
    residentRegionCode: pick(source, "locatjumin_cd"),
    cadastralRegionCode: pick(source, "locatjijuk_cd"),
    addressName,
    order: pick(source, "locat_order"),
    note: pick(source, "locat_rm"),
    highRegionCode: pick(source, "locathigh_cd") ?? parentRegionCode(regionCode),
    lowName: pick(source, "locallow_nm"),
    createdDate: pick(source, "adpt_de"),
    raw: source,
  };
}

export function parseStandardRegionCodeResult(data: unknown): StandardRegionCodeResult {
  const rawXml = data && typeof data === "object" ? toStringValue((data as { raw?: unknown }).raw) : null;
  const rawJson = rawXml ? parseRawJson(rawXml) : null;
  if (rawJson) return parseStandardRegionCodeResult(rawJson);

  const rows = rawXml ? collectXmlRows(rawXml) : collectRegionLikeObjects(data);
  const totalCount = rawXml
    ? toNumberValue(textBetweenTag(rawXml, "totalCount"))
    : toNumberValue(findFirstValue(data, "totalCount"));
  const pageNo = rawXml
    ? toNumberValue(textBetweenTag(rawXml, "pageNo"))
    : toNumberValue(findFirstValue(data, "pageNo"));
  const numOfRows = rawXml
    ? toNumberValue(textBetweenTag(rawXml, "numOfRows"))
    : toNumberValue(findFirstValue(data, "numOfRows"));

  const normalized = rows.map(normalizeRow).filter((row): row is StandardRegionCodeRow => row !== null);
  return {
    totalCount,
    pageNo,
    numOfRows,
    rows: dedupeStandardRegionRows(normalized),
  };
}

export function dedupeStandardRegionRows(rows: StandardRegionCodeRow[]): StandardRegionCodeRow[] {
  const deduped = new Map<string, StandardRegionCodeRow>();
  for (const row of rows) {
    if (!deduped.has(row.regionCode)) deduped.set(row.regionCode, row);
  }
  return Array.from(deduped.values());
}

export function standardRegionLevel(row: Pick<StandardRegionCodeRow, "sigunguCode" | "eupMyeonDongCode" | "riCode">): StandardRegionLevel {
  if (row.sigunguCode === "000" && row.eupMyeonDongCode === "000" && row.riCode === "00") return "sido";
  if (row.sigunguCode !== "000" && row.eupMyeonDongCode === "000" && row.riCode === "00") return "sigungu";
  if (row.sigunguCode !== "000" && row.eupMyeonDongCode !== "000" && row.riCode === "00") return "eupMyeonDong";
  if (row.sigunguCode !== "000" && row.eupMyeonDongCode !== "000" && row.riCode !== "00") return "ri";
  return "unknown";
}

export function parentRegionCode(regionCode: string): string {
  if (!/^\d{10}$/.test(regionCode)) return "0000000000";
  const sigunguCode = regionCode.slice(2, 5);
  const eupMyeonDongCode = regionCode.slice(5, 8);
  const riCode = regionCode.slice(8, 10);
  if (sigunguCode === "000") return "0000000000";
  if (eupMyeonDongCode === "000") return `${regionCode.slice(0, 2)}00000000`;
  if (riCode === "00") return `${regionCode.slice(0, 5)}00000`;
  return `${regionCode.slice(0, 8)}00`;
}

export function standardRegionSortKey(row: StandardRegionCodeRow): string {
  return `${row.order ?? row.regionCode}-${row.regionCode}`;
}
