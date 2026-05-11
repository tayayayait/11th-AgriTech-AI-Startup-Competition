import type { DiagnosisResult } from "@/domain/ai/diagnosis";
import { buildDiagnosisTimelineItem } from "@/domain/timeline/timelineItems";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import type { NpmsDiagnosisReference } from "@/services/npmsPestService";
import { tryCreateTimelineItem } from "@/services/timelineService";

export interface DiagnosisChecklistItem {
  label: string;
  done: boolean;
}

export interface DiagnosisFieldSnapshot {
  id: string;
  name: string | null;
  cropName: string | null;
  address?: string | null;
}

export interface DiagnosisRecordHistoryItem {
  id: string;
  createdAt: string;
  expiresAt: string;
  cropName: string | null;
  bodyPart: string | null;
  imageUrl: string | null;
  imageName: string | null;
  confidenceBand: string | null;
  fieldSnapshot: DiagnosisFieldSnapshot | null;
  result: DiagnosisResult;
  candidates: DiagnosisResult["candidates"];
  references: NpmsDiagnosisReference[];
  checklist: DiagnosisChecklistItem[];
}

const DIAGNOSIS_RECORD_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
type DiagnosisRecordExtraFields = {
  image_name: string | null;
  field_snapshot: Json | null;
  analysis_result: Json | null;
};
type DiagnosisRecordRow = Tables<"diagnosis_records"> & DiagnosisRecordExtraFields;
type DiagnosisRecordInsertPayload = TablesInsert<"diagnosis_records"> & Partial<DiagnosisRecordExtraFields>;

interface SaveDiagnosisRecordInput {
  fieldId: string;
  cropName: string;
  bodyPart: string;
  result: DiagnosisResult;
  references?: NpmsDiagnosisReference[];
  checklist: DiagnosisChecklistItem[];
  firstImageName?: string | null;
  firstImageDataUrl?: string | null;
  fieldSnapshot?: DiagnosisFieldSnapshot | null;
}

function mapConfidenceBandToDbValue(band: string | undefined): string | null {
  if (!band) return null;
  if (band.includes("높")) return "high";
  if (band.includes("낮")) return "low";

  const lower = band.toLowerCase();
  if (lower.includes("high")) return "high";
  if (lower.includes("low")) return "low";
  return "medium";
}

function createExpiresAt(): string {
  return new Date(Date.now() + DIAGNOSIS_RECORD_RETENTION_DAYS * MS_PER_DAY).toISOString();
}

function normalizeFieldSnapshot(snapshot: DiagnosisFieldSnapshot | null | undefined): DiagnosisFieldSnapshot | null {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    name: snapshot.name ?? null,
    cropName: snapshot.cropName ?? null,
    address: snapshot.address ?? null,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNpmsDetailServiceCode(value: unknown): NpmsDiagnosisReference["detailServiceCode"] {
  return value === "SVC05" || value === "SVC07" ? value : null;
}

function toNpmsSections(value: unknown): NpmsDiagnosisReference["sections"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const title = toNullableString(item.title);
      const content = toNullableString(item.content);
      if (!title || !content) return null;
      return { title, content };
    })
    .filter((item): item is NpmsDiagnosisReference["sections"][number] => item !== null);
}

function toNpmsImages(value: unknown): NpmsDiagnosisReference["images"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const url = toNullableString(item.url);
      const title = toNullableString(item.title);
      if (!url || !title) return null;
      return {
        url,
        title,
        category: toNullableString(item.category),
      };
    })
    .filter((item): item is NpmsDiagnosisReference["images"][number] => item !== null);
}

function toNpmsReferences(value: unknown): NpmsDiagnosisReference[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const id = toNullableString(item.id);
      const name = toNullableString(item.name);
      const kind = item.kind === "disease" || item.kind === "insect" ? item.kind : null;
      const cropName = toNullableString(item.cropName);
      if (!id || !name || !kind || !cropName) return null;
      return {
        id,
        name,
        kind,
        cropName,
        category: toString(item.category),
        thumbImg: toNullableString(item.thumbImg),
        detailServiceCode: toNpmsDetailServiceCode(item.detailServiceCode),
        detailKey: toNullableString(item.detailKey),
        sections: toNpmsSections(item.sections),
        images: toNpmsImages(item.images),
      };
    })
    .filter((item): item is NpmsDiagnosisReference => item !== null);
}

function toFieldSnapshot(value: Json | null): DiagnosisFieldSnapshot | null {
  if (!isObject(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  if (!id) return null;

  return {
    id,
    name: typeof value.name === "string" ? value.name : null,
    cropName: typeof value.cropName === "string" ? value.cropName : null,
    address: typeof value.address === "string" ? value.address : null,
  };
}

function toChecklist(value: Json): DiagnosisChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isObject(item)) return null;
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (!label) return null;
      return { label, done: Boolean(item.done) };
    })
    .filter((item): item is DiagnosisChecklistItem => item !== null);
}

function isDiagnosisResult(value: Json): value is DiagnosisResult {
  if (!isObject(value)) return false;
  return typeof value.disclaimer === "string" &&
    isObject(value.appearanceAssessment) &&
    Array.isArray(value.candidates) &&
    Array.isArray(value.limitations) &&
    Array.isArray(value.recommendedPhotos) &&
    Array.isArray(value.fieldChecklist);
}

function buildFallbackDiagnosisResult(row: DiagnosisRecordRow): DiagnosisResult {
  return {
    disclaimer: "사진 판독 기록입니다. 확정 진단/처방이 아닙니다.",
    appearanceAssessment: isObject(row.appearance_assessment)
      ? row.appearance_assessment as unknown as DiagnosisResult["appearanceAssessment"]
      : {
          status: "uncertain",
          confidenceBand: "낮음",
          issueLabels: [],
          summary: "저장된 외관 분석 요약이 없습니다.",
          visualReasons: [],
          recommendedActions: [],
        },
    candidates: Array.isArray(row.candidates) ? row.candidates as unknown as DiagnosisResult["candidates"] : [],
    limitations: Array.isArray(row.limitations) ? row.limitations.filter((item): item is string => typeof item === "string") : [],
    recommendedPhotos: Array.isArray(row.recommended_photos) ? row.recommended_photos.filter((item): item is string => typeof item === "string") : [],
    fieldChecklist: toChecklist(row.checklist).map((item) => item.label),
  };
}

function toDiagnosisResult(row: DiagnosisRecordRow): DiagnosisResult {
  if (isDiagnosisResult(row.analysis_result)) {
    return row.analysis_result;
  }
  return buildFallbackDiagnosisResult(row);
}

function toStoredReferences(row: DiagnosisRecordRow): NpmsDiagnosisReference[] {
  if (!isObject(row.analysis_result)) return [];
  return toNpmsReferences(row.analysis_result.npmsReferences);
}

function mapHistoryRecord(row: DiagnosisRecordRow): DiagnosisRecordHistoryItem {
  const result = toDiagnosisResult(row);
  return {
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    cropName: row.crop_name,
    bodyPart: row.body_part,
    imageUrl: row.image_url,
    imageName: row.image_name,
    confidenceBand: row.confidence_band,
    fieldSnapshot: toFieldSnapshot(row.field_snapshot),
    result,
    candidates: result.candidates,
    references: toStoredReferences(row),
    checklist: toChecklist(row.checklist),
  };
}

export async function saveDiagnosisRecord(input: SaveDiagnosisRecordInput): Promise<string> {
  const topCandidate = input.result.candidates[0];
  const fieldSnapshot = normalizeFieldSnapshot(input.fieldSnapshot);
  const references = toNpmsReferences(input.references);
  const analysisResult = references.length > 0
    ? { ...input.result, npmsReferences: references }
    : input.result;

  const payload: DiagnosisRecordInsertPayload = {
    field_id: input.fieldId,
    crop_name: input.cropName,
    body_part: input.bodyPart,
    image_url: input.firstImageDataUrl ?? input.firstImageName ?? null,
    image_name: input.firstImageName ?? null,
    confidence_band: mapConfidenceBandToDbValue(topCandidate?.confidenceBand),
    appearance_assessment: input.result.appearanceAssessment as unknown as Json,
    analysis_result: analysisResult as unknown as Json,
    field_snapshot: (fieldSnapshot ?? {}) as unknown as Json,
    candidates: input.result.candidates as unknown as Json,
    checklist: input.checklist as unknown as Json,
    limitations: input.result.limitations as unknown as Json,
    recommended_photos: input.result.recommendedPhotos as unknown as Json,
    expires_at: createExpiresAt(),
  };

  const { data, error } = await supabase
    .from("diagnosis_records")
    .insert(payload)
    .select("id,created_at")
    .single();

  if (error) throw error;
  await tryCreateTimelineItem(buildDiagnosisTimelineItem({
    fieldId: input.fieldId,
    diagnosisId: data.id,
    candidateName: topCandidate?.name ?? null,
    confidenceBand: mapConfidenceBandToDbValue(topCandidate?.confidenceBand),
    createdAt: data.created_at ?? new Date().toISOString(),
  }));
  return data.id;
}

export async function getDiagnosisRecordHistoryByField(
  fieldId: string,
  limit = 20,
): Promise<DiagnosisRecordHistoryItem[]> {
  const { data, error } = await supabase
    .from("diagnosis_records")
    .select("*")
    .eq("field_id", fieldId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapHistoryRecord);
}

export async function updateDiagnosisRecordChecklist(
  recordId: string,
  checklist: DiagnosisChecklistItem[],
): Promise<void> {
  const { error } = await supabase
    .from("diagnosis_records")
    .update({ checklist: checklist as unknown as Json })
    .eq("id", recordId);

  if (error) throw error;
}

export async function deleteDiagnosisRecord(recordId: string): Promise<void> {
  const { error } = await supabase
    .from("diagnosis_records")
    .delete()
    .eq("id", recordId);

  if (error) throw error;
}
