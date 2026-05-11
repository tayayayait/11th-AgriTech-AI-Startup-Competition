import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type WeatherRiskRow = Tables<"weather_risks">;
type PestRiskRow = Tables<"pest_risks">;

export interface PestRiskView extends Omit<PestRiskRow, "reasons" | "official_sources"> {
  reasons: string[];
  official_sources: string[];
}

function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function getLatestWeatherRisk(fieldId: string): Promise<WeatherRiskRow | null> {
  const { data, error } = await supabase
    .from("weather_risks")
    .select("*")
    .eq("field_id", fieldId)
    .order("forecast_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPestRisks(fieldId: string): Promise<PestRiskView[]> {
  const { data, error } = await supabase
    .from("pest_risks")
    .select("*")
    .eq("field_id", fieldId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    reasons: toStringArray(row.reasons),
    official_sources: toStringArray(row.official_sources),
  }));
}
