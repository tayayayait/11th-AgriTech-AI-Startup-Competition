
CREATE TABLE public.fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  crop_name TEXT NOT NULL,
  growth_stage TEXT,
  area_m2 NUMERIC NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'unknown',
  risk_score INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.weather_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES public.fields(id) ON DELETE CASCADE,
  precipitation NUMERIC,
  temperature NUMERIC,
  wind NUMERIC,
  humidity NUMERIC,
  summary TEXT,
  forecast_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pest_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES public.fields(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  official_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.task_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES public.fields(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 5,
  title TEXT NOT NULL,
  reason TEXT,
  duration_min INT,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.diagnosis_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES public.fields(id) ON DELETE CASCADE,
  image_url TEXT,
  crop_name TEXT,
  body_part TEXT,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_band TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES public.fields(id) ON DELETE CASCADE,
  period TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pesticide_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop TEXT NOT NULL,
  target TEXT NOT NULL,
  item TEXT NOT NULL,
  pre_harvest_days INT,
  max_uses INT,
  source_url TEXT
);

ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pest_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnosis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesticide_lookups ENABLE ROW LEVEL SECURITY;

-- Prototype: public read & write (no auth in v1)
CREATE POLICY "public read fields" ON public.fields FOR SELECT USING (true);
CREATE POLICY "public write fields" ON public.fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read weather" ON public.weather_risks FOR SELECT USING (true);
CREATE POLICY "public write weather" ON public.weather_risks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read pest" ON public.pest_risks FOR SELECT USING (true);
CREATE POLICY "public write pest" ON public.pest_risks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read tasks" ON public.task_cards FOR SELECT USING (true);
CREATE POLICY "public write tasks" ON public.task_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read diagnosis" ON public.diagnosis_records FOR SELECT USING (true);
CREATE POLICY "public write diagnosis" ON public.diagnosis_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "public write reports" ON public.reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read pesticide" ON public.pesticide_lookups FOR SELECT USING (true);
