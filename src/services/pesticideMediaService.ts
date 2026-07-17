import { supabase } from "@/integrations/supabase/client";

export interface VerifiedPesticideMedia {
  imageUrl: string;
  productPageUrl: string;
  sourceLabel: string;
  altText: string | null;
}

export async function getVerifiedPesticideMedia(
  pestiCode: string,
): Promise<VerifiedPesticideMedia | null> {
  const normalizedCode = pestiCode.trim();
  if (!normalizedCode) return null;

  const { data, error } = await supabase
    .from("psis_pesticide_media")
    .select("image_url,source_url,source_label,alt_text,is_primary,last_verified_at")
    .eq("pesti_code", normalizedCode)
    .eq("verification_status", "verified")
    .order("is_primary", { ascending: false })
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`농약 제품 이미지를 불러오지 못했습니다: ${error.message}`);
  }
  if (!data) return null;

  return {
    imageUrl: data.image_url,
    productPageUrl: data.source_url,
    sourceLabel: data.source_label?.trim() || "공식 제조사 제품 이미지",
    altText: data.alt_text,
  };
}
