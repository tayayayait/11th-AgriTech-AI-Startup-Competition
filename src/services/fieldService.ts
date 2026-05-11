import type { FieldFarmmapMeta, FieldRow } from "@/domain/fields/types";
import { normalizeRiskLevel } from "@/domain/risk/risk";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { ensureUserSession } from "@/services/authService";

type DbFieldRow = Tables<"fields">;

export interface CreateFieldInput {
  name: string;
  cropName: string;
  address?: string | null;
  lat: number;
  lng: number;
  areaM2?: number | null;
  pnu?: string | null;
  farmmapMeta?: FieldFarmmapMeta;
}

function normalizeAreaM2(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function toFieldRow(row: DbFieldRow): FieldRow {
  return {
    ...row,
    farmmap_meta: (row.farmmap_meta ?? {}) as FieldFarmmapMeta,
    risk_level: normalizeRiskLevel(row.risk_level, row.risk_score),
  };
}

export async function getFieldsSortedByRiskScore(): Promise<FieldRow[]> {
  await ensureUserSession();

  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .order("risk_score", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toFieldRow);
}

export async function createField(input: CreateFieldInput): Promise<FieldRow> {
  const ownerId = await ensureUserSession();

  const payload: TablesInsert<"fields"> = {
    name: input.name,
    crop_name: input.cropName,
    address: input.address ?? null,
    lat: input.lat,
    lng: input.lng,
    area_m2: normalizeAreaM2(input.areaM2),
    pnu: input.pnu ?? null,
    farmmap_meta: (input.farmmapMeta ?? {}) as Json,
    owner_id: ownerId,
    risk_level: "unknown",
    risk_score: 0,
  };

  const { data, error } = await supabase.from("fields").insert(payload).select("*").single();
  if (error) throw error;
  return toFieldRow(data);
}

export async function deleteField(fieldId: string): Promise<void> {
  const { error } = await supabase.from("fields").delete().eq("id", fieldId);
  if (error) throw error;
}
