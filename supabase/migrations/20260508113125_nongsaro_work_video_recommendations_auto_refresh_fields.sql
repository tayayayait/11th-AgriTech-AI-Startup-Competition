ALTER TABLE public.nongsaro_work_video_recommendations
  ADD COLUMN IF NOT EXISTS work_item_period TEXT;

ALTER TABLE public.nongsaro_work_video_recommendations
  ALTER COLUMN source_api SET DEFAULT 'nongsaro.cropEbook.videoList';

UPDATE public.nongsaro_work_video_recommendations
SET source_api = 'nongsaro.cropEbook.videoList'
WHERE source_api = 'cropEbook.videoList';

DROP POLICY IF EXISTS "owner delete nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations;

CREATE POLICY "owner delete nongsaro work video recommendations"
  ON public.nongsaro_work_video_recommendations
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

GRANT DELETE ON public.nongsaro_work_video_recommendations TO anon, authenticated;
