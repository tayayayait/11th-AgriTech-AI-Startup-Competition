CREATE TABLE IF NOT EXISTS public.weekly_farm_infos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  writer_nm TEXT,
  reg_dt DATE,
  period_start DATE,
  period_end DATE,
  hit_ct INTEGER,
  down_url TEXT,
  down_url_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT,
  summary_status TEXT NOT NULL DEFAULT 'pending',
  summary_text TEXT,
  summary_payload JSONB,
  summary_model TEXT,
  summary_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weekly_farm_infos_summary_status_chk
    CHECK (summary_status IN ('pending', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_farm_infos_period
  ON public.weekly_farm_infos(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_weekly_farm_infos_reg_dt
  ON public.weekly_farm_infos(reg_dt DESC);

CREATE OR REPLACE FUNCTION public.set_weekly_farm_infos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_weekly_farm_infos_updated_at_trigger
  ON public.weekly_farm_infos;

CREATE TRIGGER set_weekly_farm_infos_updated_at_trigger
BEFORE UPDATE ON public.weekly_farm_infos
FOR EACH ROW
EXECUTE FUNCTION public.set_weekly_farm_infos_updated_at();

ALTER TABLE public.weekly_farm_infos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated select weekly farm infos" ON public.weekly_farm_infos;
DROP POLICY IF EXISTS "authenticated insert weekly farm infos" ON public.weekly_farm_infos;
DROP POLICY IF EXISTS "authenticated update weekly farm infos" ON public.weekly_farm_infos;

CREATE POLICY "authenticated select weekly farm infos" ON public.weekly_farm_infos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated insert weekly farm infos" ON public.weekly_farm_infos
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated update weekly farm infos" ON public.weekly_farm_infos
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.weekly_farm_infos TO authenticated;
