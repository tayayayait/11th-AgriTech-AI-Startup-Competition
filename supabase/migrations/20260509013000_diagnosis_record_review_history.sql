ALTER TABLE public.diagnosis_records
  ADD COLUMN IF NOT EXISTS image_name TEXT,
  ADD COLUMN IF NOT EXISTS field_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_result JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.diagnosis_records
SET image_name = image_url
WHERE image_name IS NULL
  AND image_url IS NOT NULL
  AND image_url NOT LIKE 'data:image/%';

UPDATE public.diagnosis_records
SET analysis_result = jsonb_build_object(
  'disclaimer', '사진 판독 기록입니다. 확정 진단/처방이 아닙니다.',
  'appearanceAssessment', COALESCE(appearance_assessment, '{}'::jsonb),
  'candidates', COALESCE(candidates, '[]'::jsonb),
  'limitations', COALESCE(limitations, '[]'::jsonb),
  'recommendedPhotos', COALESCE(recommended_photos, '[]'::jsonb),
  'fieldChecklist',
    CASE
      WHEN jsonb_typeof(checklist) = 'array' THEN (
        SELECT COALESCE(jsonb_agg(item->>'label'), '[]'::jsonb)
        FROM jsonb_array_elements(checklist) AS item
        WHERE item ? 'label'
      )
      ELSE '[]'::jsonb
    END
)
WHERE analysis_result = '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_field_expires_created
  ON public.diagnosis_records(field_id, expires_at, created_at DESC);
