CREATE TABLE IF NOT EXISTS public.nongsaro_work_video_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  sub_category_code TEXT,
  work_item_key TEXT NOT NULL,
  schedule_source_id TEXT,
  work_item TEXT NOT NULL,
  video_title TEXT NOT NULL,
  video_origin_instt TEXT,
  video_link TEXT NOT NULL,
  video_img TEXT,
  match_score INTEGER NOT NULL,
  match_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_api TEXT NOT NULL DEFAULT 'cropEbook.videoList',
  judged_by TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nongsaro_work_video_recommendations_match_score_chk
    CHECK (match_score >= 0 AND match_score <= 100),
  CONSTRAINT nongsaro_work_video_recommendations_match_type_chk
    CHECK (match_type IN ('direct', 'reference', 'low', 'exclude')),
  CONSTRAINT nongsaro_work_video_recommendations_unique_video
    UNIQUE (field_id, work_item_key, video_link)
);

CREATE INDEX IF NOT EXISTS idx_nongsaro_work_video_recommendations_field_work
  ON public.nongsaro_work_video_recommendations(field_id, work_item_key);

CREATE INDEX IF NOT EXISTS idx_nongsaro_work_video_recommendations_score
  ON public.nongsaro_work_video_recommendations(field_id, work_item_key, match_score DESC);

CREATE OR REPLACE FUNCTION public.set_nongsaro_work_video_recommendations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_nongsaro_work_video_recommendations_updated_at_trigger
  ON public.nongsaro_work_video_recommendations;

CREATE TRIGGER set_nongsaro_work_video_recommendations_updated_at_trigger
BEFORE UPDATE ON public.nongsaro_work_video_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.set_nongsaro_work_video_recommendations_updated_at();

ALTER TABLE public.nongsaro_work_video_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner select nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations;
DROP POLICY IF EXISTS "owner insert nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations;
DROP POLICY IF EXISTS "owner update nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations;

CREATE POLICY "owner select nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

GRANT SELECT, INSERT, UPDATE ON public.nongsaro_work_video_recommendations TO anon, authenticated;
