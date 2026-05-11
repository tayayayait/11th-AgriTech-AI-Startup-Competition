import type { RiskLevel } from "@/domain/risk/risk";

export interface FieldFarmmapMeta {
  source?: "farmmap_pnu" | "farmmap_map_click" | "farmmap_region_lookup" | "manual_address" | "manual_coordinate";
  classification?: string | null;
  legalDongAddress?: string | null;
  representativePnu?: string | null;
  areaM2?: number | null;
  raw?: unknown;
}

export interface FieldRow {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  crop_name: string;
  growth_stage: string | null;
  area_m2: number;
  pnu: string | null;
  farmmap_meta: FieldFarmmapMeta;
  risk_level: RiskLevel;
  risk_score: number;
  updated_at: string;
}
