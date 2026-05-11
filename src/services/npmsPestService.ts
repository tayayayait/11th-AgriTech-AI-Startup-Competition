import { resolveNpmsCropProfile, type NpmsCropProfile } from "@/domain/npms/cropCodes";
import type { PestRiskOfficialSource } from "@/domain/pest/pestRiskForecast";
import { fetchNpms } from "@/services/npmsClient";

type NpmsPestDivCode = "NP01" | "NP03";
type NpmsPestKind = "disease" | "insect";
type NpmsPestDetailServiceCode = "SVC05" | "SVC07";

type NpmsIntegratedSearchItem = Record<string, unknown> & {
  divCode?: unknown;
  divName?: unknown;
  cropCode?: unknown;
  cropName?: unknown;
  korName?: unknown;
  oprName?: unknown;
  thumbImg?: unknown;
  detailUrl?: unknown;
};

const ALL_CANDIDATE_DISPLAY_COUNT = 20;
const CROP_PROFILE_LOOKUP_DISPLAY_COUNT = 20;
const MAX_NPMS_CANDIDATE_PAGE_REQUESTS = 50;
const dynamicCropProfileCache = new Map<string, NpmsCropProfile | null>();

export interface NpmsPestCandidate {
  id: string;
  kind: NpmsPestKind;
  divCode: NpmsPestDivCode;
  divName: string;
  cropCode: string;
  cropName: string;
  name: string;
  scientificName: string | null;
  thumbImg: string | null;
  detailServiceCode: NpmsPestDetailServiceCode | null;
  detailKey: string | null;
}

export interface NpmsPestCandidateSearchResult {
  candidates: NpmsPestCandidate[];
  totalCount: number;
}

type NpmsImageSearchItem = Record<string, unknown> & {
  pestName?: unknown;
  category?: unknown;
  thumbImg?: unknown;
  pestKey?: unknown;
};

export interface NpmsPestImageCandidate {
  id: string;
  cropCode: string;
  cropName: string;
  name: string;
  category: string;
  thumbImg: string | null;
  detailServiceCode: NpmsPestDetailServiceCode | null;
  detailKey: string | null;
}

export interface NpmsPestDetailSection {
  title: string;
  content: string;
}

export interface NpmsPestDetailImage {
  url: string;
  title: string;
  category: string | null;
}

export interface NpmsPestDetail {
  kind: NpmsPestKind;
  name: string;
  cropName: string;
  scientificName: string | null;
  sections: NpmsPestDetailSection[];
  images: NpmsPestDetailImage[];
}

export interface NpmsPestDetailRequest {
  kind: NpmsPestKind;
  name: string;
  detailServiceCode: NpmsPestDetailServiceCode | null;
  detailKey: string | null;
}

export interface NpmsDiagnosisReference {
  id: string;
  name: string;
  kind: NpmsPestKind;
  cropName: string;
  category: string;
  thumbImg: string | null;
  detailServiceCode: NpmsPestDetailServiceCode | null;
  detailKey: string | null;
  sections: NpmsPestDetailSection[];
  images: NpmsPestDetailImage[];
}

interface NpmsIntegratedCandidatePage {
  candidates: NpmsPestCandidate[];
  totalCount: number | null;
  startPoint: number;
  displayCount: number;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = toStringValue(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = toNumberValue(value);
  if (parsed === null) return null;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const parsed = toNumberValue(value);
  if (parsed === null) return null;
  const integer = Math.floor(parsed);
  return integer >= 0 ? integer : null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function normalizeCropText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function extractCropProfileFromItems(items: NpmsIntegratedSearchItem[], cropName: string): NpmsCropProfile | null {
  const normalizedCropName = normalizeCropText(cropName);
  const exactMatch = items.find((item) => normalizeCropText(toStringValue(item.cropName)) === normalizedCropName);
  const fallbackMatch = items.find((item) => {
    const candidateCropName = normalizeCropText(toStringValue(item.cropName));
    return candidateCropName.length > 0 && (
      candidateCropName.includes(normalizedCropName) ||
      normalizedCropName.includes(candidateCropName)
    );
  });
  const match = exactMatch ?? fallbackMatch;
  const cropCode = toStringValue(match?.cropCode);
  const resolvedCropName = toStringValue(match?.cropName);
  return cropCode && resolvedCropName ? { cropCode, cropName: resolvedCropName } : null;
}

async function fetchNpmsCropProfileByName(
  cropName: string,
  field: "cropName" | "searchName",
): Promise<NpmsCropProfile | null> {
  const response = await fetchNpms<NpmsIntegratedSearchItem>("SVC16", {
    serviceType: "AA003",
    [field]: cropName,
    displayCount: CROP_PROFILE_LOOKUP_DISPLAY_COUNT,
    startPoint: 1,
  });

  return extractCropProfileFromItems(response.items, cropName);
}

async function resolveNpmsCropProfileFromApi(cropName: string): Promise<NpmsCropProfile | null> {
  const cacheKey = normalizeCropText(cropName);
  if (!cacheKey) return null;
  if (dynamicCropProfileCache.has(cacheKey)) return dynamicCropProfileCache.get(cacheKey) ?? null;

  const profile = await fetchNpmsCropProfileByName(cropName, "cropName")
    ?? await fetchNpmsCropProfileByName(cropName, "searchName");
  dynamicCropProfileCache.set(cacheKey, profile);
  return profile;
}

async function resolveNpmsCropProfileForLookup(cropName: string): Promise<NpmsCropProfile | null> {
  return resolveNpmsCropProfile(cropName) ?? resolveNpmsCropProfileFromApi(cropName);
}

function cleanHtmlText(value: unknown): string {
  return toStringValue(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionsFrom(definitions: Array<[string, unknown]>): NpmsPestDetailSection[] {
  return definitions
    .map(([title, value]) => ({ title, content: cleanHtmlText(value) }))
    .filter((section) => section.content.length > 0);
}

function normalizeDetailImages(...sources: unknown[]): NpmsPestDetailImage[] {
  const seen = new Set<string>();
  const images: NpmsPestDetailImage[] = [];

  for (const source of sources) {
    for (const item of toRecordArray(source)) {
      const url = toStringValue(item.image);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      images.push({
        url,
        title: toStringValue(item.imageTitle) || toStringValue(item.photoSj) || "NCPMS 이미지",
        category: toStringValue(item.iemSpchcknNm) || toStringValue(item.priyClNm) || null,
      });
    }
  }

  return images;
}

function detailKeyFromUrl(detailUrl: string): Pick<NpmsPestCandidate, "detailServiceCode" | "detailKey"> {
  const params = new URLSearchParams(detailUrl);
  const serviceCode = params.get("serviceCode");
  if (serviceCode === "SVC05") {
    return { detailServiceCode: "SVC05", detailKey: params.get("sickKey") };
  }
  if (serviceCode === "SVC07") {
    return { detailServiceCode: "SVC07", detailKey: params.get("insectKey") };
  }
  return { detailServiceCode: null, detailKey: null };
}

function normalizeIntegratedItem(
  item: NpmsIntegratedSearchItem,
  expectedDivCode: NpmsPestDivCode,
): NpmsPestCandidate | null {
  const divCode = toStringValue(item.divCode);
  const cropCode = toStringValue(item.cropCode);
  const cropName = toStringValue(item.cropName);
  const name = toStringValue(item.korName);
  if (divCode !== expectedDivCode || !cropCode || !cropName || !name) return null;

  const detailUrl = toStringValue(item.detailUrl);
  const detail = detailKeyFromUrl(detailUrl);
  const kind: NpmsPestKind = divCode === "NP01" ? "disease" : "insect";
  const divName = toStringValue(item.divName) || (kind === "disease" ? "병" : "해충");
  const detailId = detail.detailKey ?? name;

  return {
    id: `${cropCode}:${divCode}:${detailId}`,
    kind,
    divCode,
    divName,
    cropCode,
    cropName,
    name,
    scientificName: toStringValue(item.oprName) || null,
    thumbImg: toStringValue(item.thumbImg) || null,
    detailServiceCode: detail.detailServiceCode,
    detailKey: detail.detailKey,
  };
}

async function fetchIntegratedCandidates(
  cropCode: string,
  divCode: NpmsPestDivCode,
  displayCount: number,
): Promise<NpmsPestCandidate[]> {
  const page = await fetchIntegratedCandidatePage(cropCode, divCode, displayCount, 1);
  return page.candidates;
}

async function fetchIntegratedCandidatePage(
  cropCode: string,
  divCode: NpmsPestDivCode,
  displayCount: number,
  startPoint: number,
): Promise<NpmsIntegratedCandidatePage> {
  const response = await fetchNpms<NpmsIntegratedSearchItem>("SVC16", {
    serviceType: "AA003",
    cropCode,
    divCode,
    displayCount,
    startPoint,
  });

  const candidates = response.items
    .map((item) => normalizeIntegratedItem(item, divCode))
    .filter((item): item is NpmsPestCandidate => item !== null);

  return {
    candidates,
    totalCount: toNonNegativeInteger(response.service.totalCount),
    startPoint: toPositiveInteger(response.service.startPoint) ?? startPoint,
    displayCount: toPositiveInteger(response.service.displayCount) ?? displayCount,
  };
}

async function fetchAllIntegratedCandidates(
  cropCode: string,
  divCode: NpmsPestDivCode,
): Promise<NpmsPestCandidate[]> {
  const candidates: NpmsPestCandidate[] = [];
  let startPoint = 1;

  for (let requestCount = 0; requestCount < MAX_NPMS_CANDIDATE_PAGE_REQUESTS; requestCount += 1) {
    const page = await fetchIntegratedCandidatePage(
      cropCode,
      divCode,
      ALL_CANDIDATE_DISPLAY_COUNT,
      startPoint,
    );
    candidates.push(...page.candidates);

    if (page.totalCount === null || page.candidates.length === 0) break;

    const nextStartPoint = page.startPoint + page.displayCount;
    if (nextStartPoint <= startPoint || nextStartPoint > page.totalCount) break;
    startPoint = nextStartPoint;
  }

  return candidates;
}

function dedupeCandidates(candidates: NpmsPestCandidate[]): NpmsPestCandidate[] {
  const deduped = new Map<string, NpmsPestCandidate>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.id)) deduped.set(candidate.id, candidate);
  }
  return Array.from(deduped.values());
}

export async function getNpmsPestCandidates(
  cropName: string,
  displayCount = 10,
): Promise<NpmsPestCandidate[]> {
  const profile = await resolveNpmsCropProfileForLookup(cropName);
  if (!profile) return [];

  const [diseases, insects] = await Promise.all([
    fetchIntegratedCandidates(profile.cropCode, "NP01", displayCount),
    fetchIntegratedCandidates(profile.cropCode, "NP03", displayCount),
  ]);

  return dedupeCandidates([...diseases, ...insects]);
}

export async function getAllNpmsPestCandidates(cropName: string): Promise<NpmsPestCandidateSearchResult> {
  const profile = await resolveNpmsCropProfileForLookup(cropName);
  if (!profile) return { candidates: [], totalCount: 0 };

  const [diseases, insects] = await Promise.all([
    fetchAllIntegratedCandidates(profile.cropCode, "NP01"),
    fetchAllIntegratedCandidates(profile.cropCode, "NP03"),
  ]);
  const candidates = dedupeCandidates([...diseases, ...insects]);

  return {
    candidates,
    totalCount: candidates.length,
  };
}

export async function getNpmsPestCandidateSources(cropName: string): Promise<PestRiskOfficialSource[]> {
  const candidates = await getNpmsPestCandidates(cropName, 4);
  return candidates.map((candidate) => ({
    type: "npms",
    title: `${candidate.cropName} ${candidate.divName}: ${candidate.name}`,
    url: null,
  }));
}

function normalizeDiseaseDetail(
  fallback: NpmsPestDetailRequest,
  service: Record<string, unknown>,
): NpmsPestDetail {
  return {
    kind: "disease",
    name: toStringValue(service.sickNameKor) || fallback.name,
    cropName: toStringValue(service.cropName),
    scientificName: toStringValue(service.sickNameEng) || null,
    sections: sectionsFrom([
      ["병 증상", service.symptoms],
      ["발생생태", service.developmentCondition],
      ["전염경로", service.infectionRoute],
      ["방제방법", service.preventionMethod],
      ["생물학적 방제방법", service.biologyPrvnbeMth],
      ["화학적 방제방법", service.chemicalPrvnbeMth],
      ["기타", service.etc],
    ]),
    images: normalizeDetailImages(service.imageList, service.virusImgList),
  };
}

function normalizeInsectDetail(
  fallback: NpmsPestDetailRequest,
  service: Record<string, unknown>,
): NpmsPestDetail {
  const genus = toStringValue(service.insectGenus);
  const species = toStringValue(service.insectSpecies);
  const scientificName = [genus, species].filter(Boolean).join(" ") || null;

  return {
    kind: "insect",
    name: toStringValue(service.insectSpeciesKor) || fallback.name,
    cropName: toStringValue(service.cropName),
    scientificName,
    sections: sectionsFrom([
      ["피해정보", service.damageInfo],
      ["생태정보", service.ecologyInfo],
      ["형태정보", service.stleInfo],
      ["분포정보", service.distrbInfo],
      ["방제방법", service.preventMethod],
      ["생물학적 방제방법", service.biologyPrvnbeMth],
      ["화학적 방제방법", service.chemicalPrvnbeMth],
      ["검역정보", service.qrantInfo],
    ]),
    images: normalizeDetailImages(service.imageList, service.spcsPhotoData),
  };
}

export async function getNpmsPestDetail(request: NpmsPestDetailRequest): Promise<NpmsPestDetail | null> {
  if (!request.detailServiceCode || !request.detailKey) return null;

  if (request.detailServiceCode === "SVC05") {
    const response = await fetchNpms("SVC05", {
      serviceType: "AA003",
      sickKey: request.detailKey,
    });
    return normalizeDiseaseDetail(request, response.service);
  }

  const response = await fetchNpms("SVC07", {
    serviceType: "AA003",
    insectKey: request.detailKey,
  });
  return normalizeInsectDetail(request, response.service);
}

function imageCategoryDetailService(category: string): NpmsPestDetailServiceCode | null {
  if (category === "병생태") return "SVC05";
  if (category === "해충생태") return "SVC07";
  return null;
}

export async function getNpmsPestImageCandidates(
  cropName: string,
  displayCount = 20,
): Promise<NpmsPestImageCandidate[]> {
  const profile = await resolveNpmsCropProfileForLookup(cropName);
  if (!profile) return [];

  const response = await fetchNpms<NpmsImageSearchItem>("SVC13", {
    serviceType: "AA003",
    cropCode: profile.cropCode,
    displayCount,
    startPoint: 1,
  });

  return response.items
    .map((item): NpmsPestImageCandidate | null => {
      const name = toStringValue(item.pestName);
      const category = toStringValue(item.category);
      const detailKey = toStringValue(item.pestKey);
      if (!name || !category || !detailKey) return null;

      return {
        id: `${profile.cropCode}:${category}:${detailKey}`,
        cropCode: profile.cropCode,
        cropName: profile.cropName,
        name,
        category,
        thumbImg: toStringValue(item.thumbImg) || null,
        detailServiceCode: imageCategoryDetailService(category),
        detailKey,
      };
    })
    .filter((item): item is NpmsPestImageCandidate => item !== null);
}

function kindFromImageCategory(category: string, detailServiceCode: NpmsPestDetailServiceCode | null): NpmsPestKind {
  if (detailServiceCode === "SVC07" || category.includes("해충")) return "insect";
  return "disease";
}

function canonicalDiagnosisReferenceId(input: {
  cropCode?: string;
  cropName: string;
  detailServiceCode: NpmsPestDetailServiceCode | null;
  detailKey: string | null;
  kind: NpmsPestKind;
  name: string;
}): string {
  const cropKey = input.cropCode || input.cropName;
  if (input.detailServiceCode && input.detailKey) {
    return `${cropKey}:${input.detailServiceCode}:${input.detailKey}`;
  }
  return `${cropKey}:${input.kind}:${input.name}`;
}

function imageCandidateToReference(candidate: NpmsPestImageCandidate): NpmsDiagnosisReference {
  const kind = kindFromImageCategory(candidate.category, candidate.detailServiceCode);
  return {
    id: canonicalDiagnosisReferenceId({
      cropCode: candidate.cropCode,
      cropName: candidate.cropName,
      detailServiceCode: candidate.detailServiceCode,
      detailKey: candidate.detailKey,
      kind,
      name: candidate.name,
    }),
    name: candidate.name,
    kind,
    cropName: candidate.cropName,
    category: candidate.category,
    thumbImg: candidate.thumbImg,
    detailServiceCode: candidate.detailServiceCode,
    detailKey: candidate.detailKey,
    sections: [],
    images: [],
  };
}

function integratedCandidateToReference(candidate: NpmsPestCandidate): NpmsDiagnosisReference {
  return {
    id: canonicalDiagnosisReferenceId({
      cropCode: candidate.cropCode,
      cropName: candidate.cropName,
      detailServiceCode: candidate.detailServiceCode,
      detailKey: candidate.detailKey,
      kind: candidate.kind,
      name: candidate.name,
    }),
    name: candidate.name,
    kind: candidate.kind,
    cropName: candidate.cropName,
    category: candidate.divName,
    thumbImg: candidate.thumbImg,
    detailServiceCode: candidate.detailServiceCode,
    detailKey: candidate.detailKey,
    sections: [],
    images: [],
  };
}

function dedupeDiagnosisReferences(references: NpmsDiagnosisReference[]): NpmsDiagnosisReference[] {
  const deduped = new Map<string, NpmsDiagnosisReference>();
  for (const reference of references) {
    const key = reference.detailServiceCode && reference.detailKey
      ? `${reference.cropName}:${reference.detailServiceCode}:${reference.detailKey}`
      : `${reference.cropName}:${reference.kind}:${reference.name}`;
    if (!deduped.has(key)) deduped.set(key, reference);
  }
  return Array.from(deduped.values());
}

async function attachReferenceDetail(reference: NpmsDiagnosisReference): Promise<NpmsDiagnosisReference> {
  try {
    const detail = await getNpmsPestDetail(reference);
    if (!detail) return reference;
    return {
      ...reference,
      name: detail.name || reference.name,
      cropName: detail.cropName || reference.cropName,
      sections: detail.sections,
      images: detail.images,
    };
  } catch {
    return reference;
  }
}

export async function getNpmsPhotoDiagnosisReferences(
  cropName: string,
  limit = 8,
): Promise<NpmsDiagnosisReference[]> {
  const safeLimit = Math.max(1, Math.min(20, Math.round(limit)));
  const imageReferences = (await getNpmsPestImageCandidates(cropName, safeLimit)).map(imageCandidateToReference);
  let references = dedupeDiagnosisReferences(imageReferences);

  if (references.length < safeLimit) {
    const integratedReferences = (await getNpmsPestCandidates(cropName, safeLimit)).map(integratedCandidateToReference);
    references = dedupeDiagnosisReferences([...references, ...integratedReferences]);
  }

  return Promise.all(references.slice(0, safeLimit).map(attachReferenceDetail));
}

export interface NpmsPestSummary {
  symptoms: string;
  prevention: string;
  environment: string;
}

export function getSummarizedPestDetail(detail: NpmsPestDetail | null): NpmsPestSummary | null {
  if (!detail) return null;

  const getSection = (titles: string[]) => {
    for (const title of titles) {
      const section = detail.sections.find((s) => s.title.includes(title));
      if (section && section.content) return section.content;
    }
    return "";
  };

  const symptoms = getSection(["병 증상", "피해정보"]);
  const prevention = getSection(["방제방법", "화학적 방제", "생물학적 방제"]);
  const environment = getSection(["발생생태", "생태정보"]);

  if (!symptoms && !prevention && !environment) return null;

  return {
    symptoms: symptoms.slice(0, 150) + (symptoms.length > 150 ? "..." : ""),
    prevention: prevention.slice(0, 150) + (prevention.length > 150 ? "..." : ""),
    environment: environment.slice(0, 150) + (environment.length > 150 ? "..." : ""),
  };
}
