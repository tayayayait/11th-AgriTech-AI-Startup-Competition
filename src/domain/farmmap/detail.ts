import type { FieldRow } from "@/domain/fields/types";

export interface FarmmapInfoDetail {
  classification: string | null;
  areaM2: number | null;
  cadastralMatchRate: number | null;
  aerialPhotoYear: string | null;
  updateYear: string | null;
  representativeAddress: string | null;
}

export interface LinkedCadastralInfo {
  landCategory: string | null;
  areaM2: number | null;
  ownershipType: string | null;
  pnu: string | null;
  cultivatedAreaM2: number | null;
  arableRate: number | null;
  farmmapFieldCount: number | null;
}

export interface FarmmapFieldDetail {
  farmmapInfo: FarmmapInfoDetail;
  linkedCadastralInfos: LinkedCadastralInfo[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pickValue(source: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(source);
  for (const alias of aliases) {
    const found = entries.find(([key]) => key.toLowerCase() === alias.toLowerCase());
    if (found) return found[1];
  }
  return null;
}

function pickString(source: Record<string, unknown>, aliases: string[]): string | null {
  const value = pickValue(source, aliases);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickNumber(source: Record<string, unknown>, aliases: string[]): number | null {
  const value = pickValue(source, aliases);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractYear(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  return match ? match[0] : null;
}

function normalizeCount(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.max(0, Math.round(value));
}

function cadastralRecord(
  source: Record<string, unknown>,
  pnu: string | null,
  landCategory: string | null,
  fallbackAreaM2: number | null,
): LinkedCadastralInfo {
  const cadastralAreaM2 = pickNumber(source, ["지적면적", "cadastralArea", "cad_area", "cadarea", "basearea"]);
  const cultivatedAreaM2 = pickNumber(source, ["경작면적", "cultivatedArea", "farm_area"]);
  const explicitArableRate = pickNumber(source, ["경작비율", "farm_ratio", "arableRate", "farmlandRate", "cultivationRate"]);
  const arableRate = explicitArableRate
    ?? (cadastralAreaM2 && cultivatedAreaM2 ? (cultivatedAreaM2 / cadastralAreaM2) * 100 : null);

  return {
    landCategory,
    areaM2: cadastralAreaM2 ?? fallbackAreaM2,
    ownershipType: pickString(source, ["소유구분", "ownershipType", "owner_type", "own_gbn", "own_se"]),
    pnu,
    cultivatedAreaM2,
    arableRate,
    farmmapFieldCount: normalizeCount(pickNumber(source, ["팜맵농경지수", "farmmapFieldCount", "farmmap_count", "farm_cnt"])),
  };
}

export function buildFarmmapFieldDetail(
  field: FieldRow,
  analysisRaw?: Record<string, unknown> | null,
): FarmmapFieldDetail {
  const raw = {
    ...asRecord(field.farmmap_meta.raw),
    ...asRecord(analysisRaw),
  };
  const classification = field.farmmap_meta.classification
    ?? pickString(raw, ["분류명", "농경지분류", "clsf_nm", "classification"])
    ?? field.crop_name
    ?? null;
  const areaM2 = field.farmmap_meta.areaM2
    ?? pickNumber(raw, ["면적", "area", "areaM2", "basearea", "farm_area"])
    ?? field.area_m2
    ?? null;
  const representativeAddress = pickString(raw, ["대표주소", "stdg_addr", "법정동주소", "legalDongAddress", "address"])
    ?? field.farmmap_meta.legalDongAddress
    ?? field.address
    ?? null;
  const representativePnu = pickString(raw, ["대표PNU", "pnu", "PNU", "필지고유번호"])
    ?? field.farmmap_meta.representativePnu
    ?? field.pnu
    ?? null;
  const subPnu = pickString(raw, ["부PNU", "sb_pnu"]);

  const records = [
    cadastralRecord(
      raw,
      representativePnu,
      pickString(raw, ["대표지목", "ldcg_cd", "지목", "jimok"]),
      areaM2,
    ),
  ];

  if (subPnu && subPnu !== representativePnu) {
    records.push(cadastralRecord(
      raw,
      subPnu,
      pickString(raw, ["부지목", "sb_ldcg_cd", "지목", "jimok"]),
      areaM2,
    ));
  }

  return {
    farmmapInfo: {
      classification,
      areaM2,
      cadastralMatchRate: pickNumber(raw, ["지적일치율", "cad_con_ra", "cadastralMatchRate", "cadConRa"]),
      aerialPhotoYear: extractYear(pickString(raw, ["항공사진연도", "항공사진", "flight_ymd", "aerialPhotoYear"])),
      updateYear: extractYear(pickString(raw, ["갱신연도", "갱신일", "updt_ymd", "updateYear"])),
      representativeAddress,
    },
    linkedCadastralInfos: records,
  };
}
