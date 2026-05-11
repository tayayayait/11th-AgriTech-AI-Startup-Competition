DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level_enum') THEN
    CREATE TYPE public.risk_level_enum AS ENUM ('low', 'watch', 'high', 'critical', 'unknown');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status_enum') THEN
    CREATE TYPE public.task_status_enum AS ENUM ('pending', 'in_progress', 'done', 'deferred', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_status_enum') THEN
    CREATE TYPE public.source_status_enum AS ENUM ('connected', 'delayed', 'unavailable', 'rate_limited');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'diagnosis_status_enum') THEN
    CREATE TYPE public.diagnosis_status_enum AS ENUM (
      'ready',
      'uploading',
      'analyzing',
      'needs_more_photo',
      'completed',
      'limited',
      'failed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'confidence_band_enum') THEN
    CREATE TYPE public.confidence_band_enum AS ENUM ('high', 'medium', 'low');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timeline_item_type_enum') THEN
    CREATE TYPE public.timeline_item_type_enum AS ENUM ('risk', 'task', 'photo', 'diagnosis', 'source', 'report');
  END IF;
END
$$;

ALTER TABLE public.fields
  ADD COLUMN IF NOT EXISTS pnu TEXT,
  ADD COLUMN IF NOT EXISTS farmmap_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.fields
  DROP CONSTRAINT IF EXISTS fields_pnu_format_chk;

ALTER TABLE public.fields
  ADD CONSTRAINT fields_pnu_format_chk
  CHECK (pnu IS NULL OR pnu ~ '^[0-9]{19}$');

ALTER TABLE public.fields
  DROP CONSTRAINT IF EXISTS fields_lat_range_chk;

ALTER TABLE public.fields
  ADD CONSTRAINT fields_lat_range_chk
  CHECK (lat BETWEEN 33.0 AND 39.5);

ALTER TABLE public.fields
  DROP CONSTRAINT IF EXISTS fields_lng_range_chk;

ALTER TABLE public.fields
  ADD CONSTRAINT fields_lng_range_chk
  CHECK (lng BETWEEN 124.0 AND 132.0);

UPDATE public.fields
SET risk_level = CASE
  WHEN risk_level IN ('low', 'watch', 'high', 'critical', 'unknown') THEN risk_level
  WHEN risk_score >= 90 THEN 'critical'
  WHEN risk_score >= 70 THEN 'high'
  WHEN risk_score >= 40 THEN 'watch'
  WHEN risk_score >= 0 THEN 'low'
  ELSE 'unknown'
END
WHERE risk_level IS DISTINCT FROM CASE
  WHEN risk_level IN ('low', 'watch', 'high', 'critical', 'unknown') THEN risk_level
  WHEN risk_score >= 90 THEN 'critical'
  WHEN risk_score >= 70 THEN 'high'
  WHEN risk_score >= 40 THEN 'watch'
  WHEN risk_score >= 0 THEN 'low'
  ELSE 'unknown'
END;

ALTER TABLE public.fields
  ALTER COLUMN risk_level DROP DEFAULT;

ALTER TABLE public.fields
  ALTER COLUMN risk_level TYPE public.risk_level_enum
  USING risk_level::public.risk_level_enum,
  ALTER COLUMN risk_level SET DEFAULT 'unknown'::public.risk_level_enum;

UPDATE public.task_cards
SET status = CASE
  WHEN status IN ('pending', 'in_progress', 'done', 'deferred', 'cancelled') THEN status
  ELSE 'pending'
END
WHERE status IS DISTINCT FROM CASE
  WHEN status IN ('pending', 'in_progress', 'done', 'deferred', 'cancelled') THEN status
  ELSE 'pending'
END;

ALTER TABLE public.task_cards
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.task_cards
  ALTER COLUMN status TYPE public.task_status_enum
  USING status::public.task_status_enum,
  ALTER COLUMN status SET DEFAULT 'pending'::public.task_status_enum;

ALTER TABLE public.weather_risks
  ADD COLUMN IF NOT EXISTS source_status public.source_status_enum NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.diagnosis_records
  ADD COLUMN IF NOT EXISTS status public.diagnosis_status_enum NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_photos JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.diagnosis_records
SET confidence_band = CASE
  WHEN confidence_band IN ('high', 'medium', 'low') THEN confidence_band
  WHEN confidence_band IN ('높음', '보통') THEN 'medium'
  WHEN confidence_band = '낮음' THEN 'low'
  ELSE NULL
END
WHERE confidence_band IS DISTINCT FROM CASE
  WHEN confidence_band IN ('high', 'medium', 'low') THEN confidence_band
  WHEN confidence_band IN ('높음', '보통') THEN 'medium'
  WHEN confidence_band = '낮음' THEN 'low'
  ELSE NULL
END;

ALTER TABLE public.diagnosis_records
  ALTER COLUMN confidence_band TYPE public.confidence_band_enum
  USING confidence_band::public.confidence_band_enum;

CREATE TABLE IF NOT EXISTS public.timeline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  type public.timeline_item_type_enum NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_items_field_created_at
  ON public.timeline_items(field_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fields_owner_id
  ON public.fields(owner_id);

CREATE INDEX IF NOT EXISTS idx_fields_pnu
  ON public.fields(pnu);

CREATE INDEX IF NOT EXISTS idx_weather_risks_field_forecast
  ON public.weather_risks(field_id, forecast_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_cards_field_status_priority
  ON public.task_cards(field_id, status, priority);

ALTER TABLE public.timeline_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write fields" ON public.fields;
DROP POLICY IF EXISTS "public write weather" ON public.weather_risks;
DROP POLICY IF EXISTS "public write pest" ON public.pest_risks;
DROP POLICY IF EXISTS "public write tasks" ON public.task_cards;
DROP POLICY IF EXISTS "public write diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "public write reports" ON public.reports;

DROP POLICY IF EXISTS "public read timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public insert timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public update timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public delete timeline" ON public.timeline_items;

CREATE POLICY "public insert fields" ON public.fields FOR INSERT WITH CHECK (true);
CREATE POLICY "public update fields" ON public.fields FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete fields" ON public.fields FOR DELETE USING (true);

CREATE POLICY "public insert weather" ON public.weather_risks FOR INSERT WITH CHECK (true);
CREATE POLICY "public update weather" ON public.weather_risks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete weather" ON public.weather_risks FOR DELETE USING (true);

CREATE POLICY "public insert pest" ON public.pest_risks FOR INSERT WITH CHECK (true);
CREATE POLICY "public update pest" ON public.pest_risks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete pest" ON public.pest_risks FOR DELETE USING (true);

CREATE POLICY "public insert tasks" ON public.task_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "public update tasks" ON public.task_cards FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete tasks" ON public.task_cards FOR DELETE USING (true);

CREATE POLICY "public insert diagnosis" ON public.diagnosis_records FOR INSERT WITH CHECK (true);
CREATE POLICY "public update diagnosis" ON public.diagnosis_records FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete diagnosis" ON public.diagnosis_records FOR DELETE USING (true);

CREATE POLICY "public insert reports" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "public update reports" ON public.reports FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete reports" ON public.reports FOR DELETE USING (true);

CREATE POLICY "public read timeline" ON public.timeline_items FOR SELECT USING (true);
CREATE POLICY "public insert timeline" ON public.timeline_items FOR INSERT WITH CHECK (true);
CREATE POLICY "public update timeline" ON public.timeline_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete timeline" ON public.timeline_items FOR DELETE USING (true);
