import type { FieldRow } from "@/domain/fields/types";
import type { FarmmapMapExtent } from "@/domain/farmmap/types";
import type { FarmmapMarkerOptions, FarmmapVectorOptions, FarmmapVectorPoint, FarmmapVectorStyle } from "@/services/farmmapSdk";

export const FARMMAP_BASE_LAYER_NAME = "fieldguard-farmmap";
export const FARMMAP_MARKER_LAYER_NAME = "fieldguard-field-markers";
export const FARMMAP_FIELD_POLYGON_LAYER_NAME = "fieldguard-field-polygons";
export const FARMMAP_WMS_LAYER_ID = "farmmap:farm_map_api";
export const FARMMAP_WMS_STYLE_ID = "t_clfm_frm_map_sy_api";

const CLASSIFICATION_STYLES: Record<string, { fillColor: string; strokeColor: string }> = {
  ricePaddy: { fillColor: "#e09023", strokeColor: "#8a540d" },
  field: { fillColor: "#d9db37", strokeColor: "#7f8215" },
  orchard: { fillColor: "#2f8f4e", strokeColor: "#176131" },
  facility: { fillColor: "#35c9d2", strokeColor: "#167b83" },
  nonFarmland: { fillColor: "#b88932", strokeColor: "#6e5017" },
  unknown: { fillColor: "#2563eb", strokeColor: "#1d4ed8" },
};

const LAND_CODE_CLASSIFICATIONS: Record<string, string> = {
  "01": "\ub17c",
  "02": "\ubc2d",
  "03": "\uacfc\uc218",
  "04": "\uc2dc\uc124",
  "06": "\ube44\uacbd\uc9c0",
};

const LAND_CODE_CLASSIFICATION_KEYS: Record<string, keyof typeof CLASSIFICATION_STYLES> = {
  "01": "ricePaddy",
  "02": "field",
  "03": "orchard",
  "04": "facility",
  "06": "nonFarmland",
};

export function hasValidFarmmapCoordinate(field: Pick<FieldRow, "lat" | "lng">): boolean {
  return Number.isFinite(field.lat)
    && Number.isFinite(field.lng)
    && field.lat >= 33
    && field.lat <= 39.5
    && field.lng >= 124
    && field.lng <= 132;
}

export function buildFarmmapMarkerOptions(
  field: Pick<FieldRow, "id" | "name" | "crop_name" | "risk_level" | "risk_score" | "lat" | "lng">,
  iconUrl: string,
  clickFunc?: () => void,
): FarmmapMarkerOptions {
  return {
    id: `field-${field.id}`,
    iconSizeWidth: 36,
    iconSizeHeight: 36,
    iconUrl,
    x: field.lng,
    y: field.lat,
    epsg: "EPSG:4326",
    opacity: 0.92,
    clickFunc,
    data: {
      id: field.id,
      name: field.name,
      cropName: field.crop_name,
      riskLevel: field.risk_level,
      riskScore: field.risk_score,
      lat: field.lat,
      lng: field.lng,
    },
  };
}

function quoteCqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function farmmapRegionPrefix(regionCode: string): string {
  const sigunguCode = regionCode.slice(2, 5);
  const eupMyeonDongCode = regionCode.slice(5, 8);
  const riCode = regionCode.slice(8, 10);
  if (sigunguCode === "000") return regionCode.slice(0, 2);
  if (eupMyeonDongCode === "000") return regionCode.slice(0, 5);
  if (riCode === "00") return regionCode.slice(0, 8);
  return regionCode;
}

function buildFarmmapRegionCqlFilter(regionCode: string): string {
  const prefix = farmmapRegionPrefix(regionCode);
  if (prefix.length === 10) return `stdg_cd=${quoteCqlString(prefix)}`;
  const minCode = prefix.padEnd(10, "0");
  const maxCode = prefix.padEnd(10, "9");
  return `stdg_cd >= ${quoteCqlString(minCode)} AND stdg_cd <= ${quoteCqlString(maxCode)}`;
}

export function buildFarmmapClassificationCqlFilter(
  landCodes: readonly string[] | null | undefined,
  regionCode?: string | null,
): string | null {
  const clauses: string[] = [];
  if (regionCode && /^\d{10}$/.test(regionCode)) {
    clauses.push(buildFarmmapRegionCqlFilter(regionCode));
  }

  const names = Array.from(new Set((landCodes ?? []).map((code) => LAND_CODE_CLASSIFICATIONS[code]).filter(Boolean)));
  if (names.length > 0) {
    clauses.push(`(${names.map((name) => `clsf_nm=${quoteCqlString(name)}`).join(" OR ")})`);
  }

  if (clauses.length === 0) return null;
  return clauses.join(" AND ");
}

function normalizeClassification(value: string | null | undefined): keyof typeof CLASSIFICATION_STYLES {
  const classification = value?.trim().toLowerCase() ?? "";
  if (classification.includes("01") || classification.includes("\ub17c")) return "ricePaddy";
  if (classification.includes("02") || classification.includes("\ubc2d")) return "field";
  if (classification.includes("03") || classification.includes("\uacfc\uc218")) return "orchard";
  if (classification.includes("04") || classification.includes("\uc2dc\uc124")) return "facility";
  if (classification.includes("06") || classification.includes("\ube44\uacbd\uc9c0")) return "nonFarmland";
  return "unknown";
}

export function farmmapClassificationMatchesLandCodes(
  classification: string | null | undefined,
  landCodes: readonly string[],
): boolean {
  const normalized = normalizeClassification(classification);
  return landCodes.some((code) => LAND_CODE_CLASSIFICATION_KEYS[code] === normalized);
}

export function farmmapFieldMatchesLandCodes(
  field: Pick<FieldRow, "crop_name" | "farmmap_meta">,
  landCodes: readonly string[],
): boolean {
  return farmmapClassificationMatchesLandCodes(field.farmmap_meta.classification, landCodes)
    || farmmapClassificationMatchesLandCodes(field.crop_name, landCodes);
}

export function buildFarmmapPolygonStyle(classification: string | null | undefined): FarmmapVectorStyle {
  const style = CLASSIFICATION_STYLES[normalizeClassification(classification)];
  return {
    fillColor: style.fillColor,
    fillOpacity: 0.52,
    strokeWidth: 2,
    strokeColor: style.strokeColor,
    strokeLinecap: "round",
  };
}

function toVectorPoint(value: unknown): FarmmapVectorPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function getFarmmapPolygonCoordinates(field: Pick<FieldRow, "farmmap_meta">): FarmmapVectorPoint[] | null {
  const raw = field.farmmap_meta.raw;
  if (!raw || typeof raw !== "object") return null;

  const geometry = (raw as { geometry?: unknown }).geometry;
  if (!Array.isArray(geometry)) return null;

  for (const geometryPart of geometry) {
    if (!geometryPart || typeof geometryPart !== "object") continue;
    const xy = (geometryPart as { xy?: unknown }).xy;
    if (!Array.isArray(xy)) continue;

    const coordinates = xy
      .map(toVectorPoint)
      .filter((point): point is FarmmapVectorPoint => point !== null);
    if (coordinates.length >= 3) return coordinates;
  }

  return null;
}

export function getFarmmapPolygonExtent(field: Pick<FieldRow, "farmmap_meta">): FarmmapMapExtent | null {
  const coordinates = getFarmmapPolygonCoordinates(field);
  if (!coordinates || coordinates.length === 0) return null;

  const xs = coordinates.map((point) => point.x);
  const ys = coordinates.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    epsg: "EPSG:5179",
    featureCount: 1,
  };
}

export function buildFarmmapPolygonOptions(
  field: Pick<FieldRow, "id" | "name" | "crop_name" | "pnu" | "farmmap_meta">,
): FarmmapVectorOptions | null {
  const xy = getFarmmapPolygonCoordinates(field);
  if (!xy) return null;

  const classification = field.farmmap_meta.classification ?? field.crop_name;
  const id = `field-polygon-${field.id}`;
  return {
    id,
    type: "polygon",
    xy,
    data: {
      id: field.id,
      name: field.name,
      pnu: field.pnu,
      classification,
    },
    attributes: { id },
    style: buildFarmmapPolygonStyle(classification),
  };
}
