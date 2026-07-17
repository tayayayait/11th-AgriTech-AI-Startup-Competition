export type PsisCatalogServiceCode = "SVC01" | "SVC02";

type RequestParams = Record<string, string | number | boolean | null | undefined>;
type JsonRecord = Record<string, unknown>;

export interface BuildPsisCatalogRowsInput {
  serviceCode: PsisCatalogServiceCode;
  fetchedAt: string;
  params: RequestParams;
  service: JsonRecord;
}

export interface PsisProductRow {
  pesti_code: string;
  item_name: string;
  brand_name: string;
  company_name: string | null;
  active_ingredient: string | null;
  manufacture_type: string | null;
  mechanism: string | null;
  first_registered_on: string | null;
  registered_component_quantity: string | null;
  toxicity_code: string | null;
  toxicity_name: string | null;
  fish_toxicity_code: string | null;
  source_service_code: PsisCatalogServiceCode;
  source_hash: string;
  source_payload: JsonRecord;
  first_seen_at: string;
  last_seen_at: string;
}

export interface PsisRegistrationRow {
  pesti_code: string;
  disease_use_seq: string;
  crop_name: string | null;
  target_name: string | null;
  use_name: string | null;
  crop_code: string | null;
  crop_group_code: string | null;
  crop_group_name: string | null;
  use_method: string | null;
  dilution: string | null;
  pre_harvest_interval: string | null;
  max_use_count: string | null;
  pre_harvest_days: number | null;
  max_uses: number | null;
  source_service_code: PsisCatalogServiceCode;
  source_hash: string;
  source_payload: JsonRecord;
  first_seen_at: string;
  last_seen_at: string;
}

export interface PsisCatalogRows {
  products: PsisProductRow[];
  registrations: PsisRegistrationRow[];
  skippedCount: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function parseKoreanCount(value: unknown, unit: "일" | "회"): number | null {
  const match = text(value).match(new RegExp(`(\\d+)\\s*${unit}`));
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hashPayload(value: unknown): string {
  const source = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function serviceItems(input: BuildPsisCatalogRowsInput): JsonRecord[] {
  if (input.serviceCode === "SVC02") {
    return [{
      ...input.service,
      pestiCode: text(input.params.pestiCode) || input.service.pestiCode,
      diseaseUseSeq: text(input.params.diseaseUseSeq) || input.service.diseaseUseSeq,
    }];
  }

  const list = input.service.list;
  if (Array.isArray(list)) return list.filter(isRecord);
  return isRecord(list) ? [list] : [];
}

function productFromItem(
  input: BuildPsisCatalogRowsInput,
  item: JsonRecord,
): PsisProductRow | null {
  const pestiCode = text(item.pestiCode);
  const itemName = text(item.pestiKorName);
  const brandName = text(item.pestiBrandName);
  if (!pestiCode || !itemName || !brandName) return null;

  return {
    pesti_code: pestiCode,
    item_name: itemName,
    brand_name: brandName,
    company_name: nullableText(item.compName),
    active_ingredient: nullableText(item.engName) ?? nullableText(item.pestiEngName),
    manufacture_type: nullableText(item.cmpaItmNm),
    mechanism: nullableText(item.indictSymbl),
    first_registered_on: nullableText(item.applyFirstRegDate),
    registered_component_quantity: nullableText(item.regCpntQnty),
    toxicity_code: nullableText(item.toxicGubun),
    toxicity_name: nullableText(item.toxicName),
    fish_toxicity_code: nullableText(item.fishToxicGubun),
    source_service_code: input.serviceCode,
    source_hash: hashPayload(item),
    source_payload: item,
    first_seen_at: input.fetchedAt,
    last_seen_at: input.fetchedAt,
  };
}

function registrationFromItem(
  input: BuildPsisCatalogRowsInput,
  item: JsonRecord,
): PsisRegistrationRow | null {
  const pestiCode = text(item.pestiCode);
  const diseaseUseSeq = text(item.diseaseUseSeq);
  if (!pestiCode || !diseaseUseSeq) return null;

  const preHarvestInterval = nullableText(item.useSuittime);
  const maxUseCount = nullableText(item.useNum);

  return {
    pesti_code: pestiCode,
    disease_use_seq: diseaseUseSeq,
    crop_name: nullableText(item.cropName),
    target_name: nullableText(item.diseaseWeedName),
    use_name: nullableText(item.useName),
    crop_code: nullableText(item.cropCd),
    crop_group_code: nullableText(item.cropLrclCd),
    crop_group_name: nullableText(item.cropLrclNm),
    use_method: nullableText(item.pestiUse),
    dilution: nullableText(item.dilutUnit),
    pre_harvest_interval: preHarvestInterval,
    max_use_count: maxUseCount,
    pre_harvest_days: parseKoreanCount(preHarvestInterval, "일"),
    max_uses: parseKoreanCount(maxUseCount, "회"),
    source_service_code: input.serviceCode,
    source_hash: hashPayload(item),
    source_payload: item,
    first_seen_at: input.fetchedAt,
    last_seen_at: input.fetchedAt,
  };
}

export function buildPsisCatalogRows(input: BuildPsisCatalogRowsInput): PsisCatalogRows {
  const productsByCode = new Map<string, PsisProductRow>();
  const registrationsByKey = new Map<string, PsisRegistrationRow>();
  let skippedCount = 0;

  for (const item of serviceItems(input)) {
    const product = productFromItem(input, item);
    const registration = registrationFromItem(input, item);

    if (!product || !registration) {
      skippedCount += 1;
      continue;
    }

    productsByCode.set(product.pesti_code, product);
    registrationsByKey.set(
      `${registration.pesti_code}:${registration.disease_use_seq}`,
      registration,
    );
  }

  return {
    products: Array.from(productsByCode.values()),
    registrations: Array.from(registrationsByKey.values()),
    skippedCount,
  };
}
