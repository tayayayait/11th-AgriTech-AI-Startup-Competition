import type {
  FarmmapAnalysisLookupResult,
  FarmmapAnalysisRecord,
  FarmmapFieldCandidate,
  FarmmapLookupResult,
  FarmmapMapExtent,
  FarmmapRegionMapLookupResult,
} from "@/domain/farmmap/types";
import { centroidFromFarmmapGeometry, epsg5179ToWgs84 } from "@/domain/farmmap/projection";
import {
  fetchFarmmapAnalysisBaseByAttr,
  fetchFarmmapAnalysisBaseByPnu,
  fetchFarmmapByBjdAndLandCode,
  fetchFarmmapByPnu,
  fetchFarmmapByXY,
  fetchFarmmapRegionExtent,
} from "@/services/farmmapClient";

export const FARMMAP_LAND_CLASSIFICATION_CODES = {
  ricePaddy: "01",
  field: "02",
  orchard: "03",
  facility: "04",
  nonFarmland: "06",
} as const;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(source: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const entry = Object.entries(source).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    if (!entry) continue;
    const [, value] = entry;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const entry = Object.entries(source).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    if (!entry) continue;
    const [, value] = entry;
    const numeric = toNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function normalizeCoordinate(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (value < min || value > max) return null;
  return value;
}

function looksLikeFieldObject(source: Record<string, unknown>): boolean {
  const keys = Object.keys(source).map((key) => key.toLowerCase());
  return keys.some((key) =>
    key.includes("pnu") ||
    key.includes("parcel") ||
    key.includes("field") ||
    key.includes("addr") ||
    key.includes("jibun") ||
    key.includes("lat") ||
    key.includes("lon"),
  );
}

function collectObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectObjects(item, depth + 1));
  if (typeof value !== "object") return [];

  const source = value as Record<string, unknown>;
  const next = Object.values(source).flatMap((child) => collectObjects(child, depth + 1));
  return [source, ...next];
}

function farmmapApplicationError(value: unknown): string | null {
  for (const source of collectObjects(value)) {
    const result = pickString(source, ["result"]);
    if (result?.toUpperCase() !== "F") continue;

    return pickString(source, ["errorMsg", "errMsg", "message"]) ?? "팜맵 API 요청이 실패했습니다.";
  }
  return null;
}

function assertFarmmapApplicationSuccess(value: unknown): void {
  const errorMessage = farmmapApplicationError(value);
  if (errorMessage) throw new Error(`팜맵 API 오류: ${errorMessage}`);
}

function parseRawJson(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = (value as { raw?: unknown }).raw;
  if (typeof raw !== "string") return value;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectPlanarPoints(value: unknown, depth = 0): Array<{ x: number; y: number }> {
  if (depth > 10 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      return [{ x: value[0], y: value[1] }];
    }
    return value.flatMap((item) => collectPlanarPoints(item, depth + 1));
  }
  if (typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap((item) => collectPlanarPoints(item, depth + 1));
}

function collectFarmmapFeatures(data: unknown): Array<{ geometry?: unknown; properties?: Record<string, unknown> }> {
  const parsed = parseRawJson(data);
  return parsed && typeof parsed === "object" && Array.isArray((parsed as { features?: unknown }).features)
    ? (parsed as { features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }> }).features
    : [];
}

function extentFromFarmmapFeatures(data: unknown): FarmmapMapExtent | null {
  const features = collectFarmmapFeatures(data);

  const points = features.flatMap((feature) => collectPlanarPoints(feature.geometry));
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    epsg: "EPSG:5179",
    featureCount: features.length,
  };
}

function firstPolygonRing(value: unknown): Array<{ x: number; y: number }> | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { coordinates?: unknown; type?: unknown };
  if (!Array.isArray(geometry.coordinates)) return null;

  const ring = geometry.type === "Polygon"
    ? geometry.coordinates[0]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates[0]?.[0]
      : null;
  if (!Array.isArray(ring)) return null;

  const points = ring
    .map((point) => Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number"
      ? { x: point[0], y: point[1] }
      : null)
    .filter((point): point is { x: number; y: number } => point !== null);
  return points.length >= 3 ? points : null;
}

function toFarmmapApiGeometry(value: unknown): Array<{ type: string; xy: Array<{ x: number; y: number }> }> | null {
  if (Array.isArray(value)) return value as Array<{ type: string; xy: Array<{ x: number; y: number }> }>;

  const ring = firstPolygonRing(value);
  if (!ring) return null;
  return [{ type: "MultiPolygon", xy: ring }];
}

function wfsFeatureToCandidate(feature: { geometry?: unknown; properties?: Record<string, unknown> }): FarmmapFieldCandidate | null {
  const properties = feature.properties ?? {};
  const geometry = toFarmmapApiGeometry(feature.geometry);
  return toCandidate({
    ...properties,
    geometry,
  });
}

function toCandidate(source: Record<string, unknown>): FarmmapFieldCandidate | null {
  const geometryCentroid = centroidFromFarmmapGeometry(source.geometry);
  const geometryWgs84 = geometryCentroid ? epsg5179ToWgs84(geometryCentroid) : null;
  const lat = normalizeCoordinate(
    pickNumber(source, ["lat", "latitude", "ypos", "pointy"]) ?? geometryWgs84?.lat ?? null,
    33,
    39.5,
  );
  const lng = normalizeCoordinate(
    pickNumber(source, ["lng", "lon", "longitude", "xpos", "pointx"]) ?? geometryWgs84?.lng ?? null,
    124,
    132,
  );
  const pnu = pickString(source, ["대표PNU", "부PNU", "필지고유번호", "pnu", "PNU", "parcelPnu", "parcel_no"]);
  const name = pickString(source, ["name", "fieldName", "parcelName", "jibun"]);
  const legalDongAddress = pickString(source, ["법정동주소", "legalDongAddress", "stdg_addr", "address", "jibunAddr", "roadAddr", "addr"]);
  const landClassification = pickString(source, ["분류명", "농경지분류", "clsf_nm", "landClassification", "classification"]);
  const areaM2 = pickNumber(source, ["면적", "지적면적", "경작면적", "areaM2", "basearea", "farm_area", "area", "m2", "sqm"]);
  const address = legalDongAddress;

  if (!pnu && !name && !address && lat === null && lng === null && areaM2 === null && !landClassification) return null;

  return {
    name,
    address,
    pnu,
    lat,
    lng,
    areaM2,
    landClassification,
    legalDongAddress,
    raw: source,
  };
}

function dedupeCandidates(candidates: FarmmapFieldCandidate[]): FarmmapFieldCandidate[] {
  const deduped = new Map<string, FarmmapFieldCandidate>();
  for (const candidate of candidates) {
    const key = [
      candidate.pnu ?? "",
      candidate.name ?? "",
      candidate.address ?? "",
      candidate.lat ?? "",
      candidate.lng ?? "",
      candidate.landClassification ?? "",
    ].join("|");
    if (!deduped.has(key)) deduped.set(key, candidate);
  }
  return Array.from(deduped.values());
}

function hasSelectableFieldInfo(candidate: FarmmapFieldCandidate): boolean {
  return Boolean(
    candidate.name ||
      candidate.address ||
      candidate.legalDongAddress ||
      candidate.landClassification ||
      candidate.areaM2 !== null ||
      (candidate.lat !== null && candidate.lng !== null),
  );
}

function normalizeCandidates(candidates: FarmmapFieldCandidate[]): FarmmapFieldCandidate[] {
  return dedupeCandidates(candidates).filter(hasSelectableFieldInfo);
}

export async function lookupFarmmapByPnu(pnu: string): Promise<FarmmapLookupResult> {
  const response = await fetchFarmmapByPnu({
    pnu,
    columnType: "KOR",
  });
  assertFarmmapApplicationSuccess(response.data);

  const objects = collectObjects(response.data).filter(looksLikeFieldObject);
  const candidates = objects
    .map(toCandidate)
    .filter((item): item is FarmmapFieldCandidate => item !== null);

  return {
    fetchedAt: response.fetchedAt,
    candidates: normalizeCandidates(candidates).slice(0, 10),
    raw: response.data,
  };
}

export async function lookupFarmmapByLatLng(lat: number, lng: number): Promise<FarmmapLookupResult> {
  const response = await fetchFarmmapByXY({
    x: lng,
    y: lat,
    epsg: "EPSG:4326",
    mapType: "farmmap",
    columnType: "KOR",
  });
  assertFarmmapApplicationSuccess(response.data);

  const objects = collectObjects(response.data).filter(looksLikeFieldObject);
  const candidates = objects
    .map(toCandidate)
    .filter((item): item is FarmmapFieldCandidate => item !== null);

  return {
    fetchedAt: response.fetchedAt,
    candidates: normalizeCandidates(candidates).slice(0, 10),
    raw: response.data,
  };
}

export async function lookupFarmmapByBjdAndLandCode(
  bjdCd: string,
  landCodes: string[],
): Promise<FarmmapLookupResult> {
  const responses = await Promise.all(
    landCodes.map((landCd) =>
      fetchFarmmapByBjdAndLandCode({
        bjdCd,
        landCd,
        mapType: "farmmap",
        columnType: "KOR",
        apiVersion: "v2",
      }),
    ),
  );
  responses.forEach((response) => assertFarmmapApplicationSuccess(response.data));

  const candidates = responses.flatMap((response) =>
    collectObjects(response.data)
      .filter(looksLikeFieldObject)
      .map(toCandidate)
      .filter((item): item is FarmmapFieldCandidate => item !== null),
  );

  return {
    fetchedAt: responses[0]?.fetchedAt ?? new Date().toISOString(),
    candidates: normalizeCandidates(candidates),
    raw: responses.map((response) => response.data),
  };
}

export async function lookupFarmmapMapExtent(
  regionCode: string,
  landCodes: string[],
): Promise<FarmmapMapExtent | null> {
  const result = await lookupFarmmapRegionMap(regionCode, landCodes);
  return result.extent;
}

export async function lookupFarmmapRegionMap(
  regionCode: string,
  landCodes: string[],
): Promise<FarmmapRegionMapLookupResult> {
  const response = await fetchFarmmapRegionExtent({
    regionCode,
    landCd: landCodes.join(","),
    maxFeatures: 500,
  });

  const features = collectFarmmapFeatures(response.data);
  const candidates = features
    .map(wfsFeatureToCandidate)
    .filter((candidate): candidate is FarmmapFieldCandidate => candidate !== null);

  return {
    fetchedAt: response.fetchedAt,
    extent: extentFromFarmmapFeatures(response.data),
    candidates: normalizeCandidates(candidates),
    raw: response.data,
  };
}

export interface FarmmapAnalysisAttrLookupParams {
  bjdCd: string;
  landCodes: string[];
  fromBaseArea?: string | number | null;
  toBaseArea?: string | number | null;
}

function extractPnus(value: unknown): string[] {
  const pnus = collectObjects(value)
    .map((source) => pickString(source, ["필지고유번호", "대표PNU", "부PNU", "pnu", "PNU"]))
    .filter((pnu): pnu is string => pnu !== null && /^\d{19}$/.test(pnu));
  return Array.from(new Set(pnus));
}

function looksLikeAnalysisRecord(source: Record<string, unknown>): boolean {
  const keys = Object.keys(source).map((key) => key.toLowerCase());
  return keys.some((key) =>
    key === "pnu" ||
    key === "basearea" ||
    key === "farm_cnt" ||
    key === "farm_area" ||
    key === "farm_ratio" ||
    key === "jimok" ||
    key.includes("경작") ||
    key.includes("지적면적") ||
    key.includes("농경지수"),
  );
}

function toAnalysisRecord(source: Record<string, unknown>): FarmmapAnalysisRecord | null {
  if (!looksLikeAnalysisRecord(source)) return null;
  const pnu = pickString(source, ["필지고유번호", "대표PNU", "부PNU", "pnu", "PNU"]);
  if (!pnu || !/^\d{19}$/.test(pnu)) return null;
  return {
    pnu,
    raw: source,
  };
}

function normalizeAnalysisRecords(records: FarmmapAnalysisRecord[]): FarmmapAnalysisRecord[] {
  const deduped = new Map<string, FarmmapAnalysisRecord>();
  for (const record of records) {
    if (!record.pnu) continue;
    if (!deduped.has(record.pnu)) deduped.set(record.pnu, record);
  }
  return Array.from(deduped.values());
}

export async function lookupFarmmapAnalysisByPnus(pnus: string[]): Promise<FarmmapAnalysisLookupResult> {
  const uniquePnus = Array.from(new Set(pnus.filter((pnu) => /^\d{19}$/.test(pnu)))).slice(0, 10);
  if (uniquePnus.length === 0) {
    return {
      fetchedAt: new Date().toISOString(),
      records: [],
      raw: null,
    };
  }

  const response = await fetchFarmmapAnalysisBaseByPnu({
    pnus: uniquePnus.join(","),
    columnType: "ENG",
  });
  assertFarmmapApplicationSuccess(response.data);

  const records = collectObjects(response.data)
    .map(toAnalysisRecord)
    .filter((record): record is FarmmapAnalysisRecord => record !== null);

  return {
    fetchedAt: response.fetchedAt,
    records: normalizeAnalysisRecords(records),
    raw: response.data,
  };
}

export async function lookupFarmmapAnalysisByAttr(
  params: FarmmapAnalysisAttrLookupParams,
): Promise<FarmmapLookupResult> {
  const response = await fetchFarmmapAnalysisBaseByAttr({
    bjdCd: params.bjdCd,
    landCd: params.landCodes.join(","),
    fromBaseArea: params.fromBaseArea ?? undefined,
    toBaseArea: params.toBaseArea ?? undefined,
    columnType: "KOR",
  });
  assertFarmmapApplicationSuccess(response.data);

  const pnus = extractPnus(response.data).slice(0, 10);
  if (pnus.length === 0) {
    return {
      fetchedAt: response.fetchedAt,
      candidates: [],
      raw: response.data,
    };
  }

  const detailResults = await Promise.allSettled(pnus.map((pnu) => lookupFarmmapByPnu(pnu)));
  const candidates = detailResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value.candidates : [],
  );

  return {
    fetchedAt: response.fetchedAt,
    candidates: normalizeCandidates(candidates),
    raw: {
      analysis: response.data,
      pnus,
      detailResults,
    },
  };
}
