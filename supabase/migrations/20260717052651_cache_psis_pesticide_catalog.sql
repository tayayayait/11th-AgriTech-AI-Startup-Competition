CREATE TABLE public.psis_pesticide_products (
  pesti_code TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  company_name TEXT,
  active_ingredient TEXT,
  manufacture_type TEXT,
  mechanism TEXT,
  first_registered_on TEXT,
  registered_component_quantity TEXT,
  toxicity_code TEXT,
  toxicity_name TEXT,
  fish_toxicity_code TEXT,
  source_service_code TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT psis_pesticide_products_service_code_chk
    CHECK (source_service_code IN ('SVC01', 'SVC02'))
);

CREATE TABLE public.psis_pesticide_registrations (
  pesti_code TEXT NOT NULL
    REFERENCES public.psis_pesticide_products(pesti_code) ON DELETE CASCADE,
  disease_use_seq TEXT NOT NULL,
  crop_name TEXT,
  target_name TEXT,
  use_name TEXT,
  crop_code TEXT,
  crop_group_code TEXT,
  crop_group_name TEXT,
  use_method TEXT,
  dilution TEXT,
  pre_harvest_interval TEXT,
  max_use_count TEXT,
  pre_harvest_days INTEGER,
  max_uses INTEGER,
  source_service_code TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pesti_code, disease_use_seq),
  CONSTRAINT psis_pesticide_registrations_service_code_chk
    CHECK (source_service_code IN ('SVC01', 'SVC02')),
  CONSTRAINT psis_pesticide_registrations_pre_harvest_days_chk
    CHECK (pre_harvest_days IS NULL OR pre_harvest_days >= 0),
  CONSTRAINT psis_pesticide_registrations_max_uses_chk
    CHECK (max_uses IS NULL OR max_uses >= 0)
);

CREATE TABLE public.psis_pesticide_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pesti_code TEXT NOT NULL
    REFERENCES public.psis_pesticide_products(pesti_code) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_label TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pesti_code, image_url),
  CONSTRAINT psis_pesticide_media_source_type_chk
    CHECK (source_type IN ('manufacturer', 'official', 'manual')),
  CONSTRAINT psis_pesticide_media_verification_status_chk
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT psis_pesticide_media_width_chk
    CHECK (width IS NULL OR width > 0),
  CONSTRAINT psis_pesticide_media_height_chk
    CHECK (height IS NULL OR height > 0)
);

CREATE TABLE public.psis_pesticide_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'api_request',
  status TEXT NOT NULL,
  request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_item_count INTEGER NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0,
  registration_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT psis_pesticide_sync_runs_service_code_chk
    CHECK (service_code IN ('SVC01', 'SVC02')),
  CONSTRAINT psis_pesticide_sync_runs_trigger_type_chk
    CHECK (trigger_type IN ('api_request', 'scheduled', 'manual')),
  CONSTRAINT psis_pesticide_sync_runs_status_chk
    CHECK (status IN ('succeeded', 'partial', 'failed')),
  CONSTRAINT psis_pesticide_sync_runs_counts_chk
    CHECK (
      source_item_count >= 0
      AND product_count >= 0
      AND registration_count >= 0
      AND skipped_count >= 0
    )
);

CREATE INDEX psis_pesticide_products_brand_name_idx
  ON public.psis_pesticide_products(brand_name);

CREATE INDEX psis_pesticide_products_item_name_idx
  ON public.psis_pesticide_products(item_name);

CREATE INDEX psis_pesticide_registrations_crop_target_idx
  ON public.psis_pesticide_registrations(crop_name, target_name);

CREATE INDEX psis_pesticide_registrations_last_seen_at_idx
  ON public.psis_pesticide_registrations(last_seen_at DESC);

CREATE UNIQUE INDEX psis_pesticide_media_one_primary_idx
  ON public.psis_pesticide_media(pesti_code)
  WHERE is_primary;

CREATE INDEX psis_pesticide_sync_runs_completed_at_idx
  ON public.psis_pesticide_sync_runs(completed_at DESC);

CREATE OR REPLACE FUNCTION public.set_psis_pesticide_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.first_seen_at := OLD.first_seen_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_psis_pesticide_products_updated_at
BEFORE UPDATE ON public.psis_pesticide_products
FOR EACH ROW
EXECUTE FUNCTION public.set_psis_pesticide_catalog_updated_at();

CREATE TRIGGER set_psis_pesticide_registrations_updated_at
BEFORE UPDATE ON public.psis_pesticide_registrations
FOR EACH ROW
EXECUTE FUNCTION public.set_psis_pesticide_catalog_updated_at();

CREATE OR REPLACE FUNCTION public.set_psis_pesticide_media_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_psis_pesticide_media_updated_at
BEFORE UPDATE ON public.psis_pesticide_media
FOR EACH ROW
EXECUTE FUNCTION public.set_psis_pesticide_media_updated_at();

ALTER TABLE public.psis_pesticide_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psis_pesticide_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psis_pesticide_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psis_pesticide_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read PSIS pesticide products"
  ON public.psis_pesticide_products
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "public read PSIS pesticide registrations"
  ON public.psis_pesticide_registrations
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "public read verified PSIS pesticide media"
  ON public.psis_pesticide_media
  FOR SELECT TO anon, authenticated
  USING (verification_status = 'verified');

REVOKE ALL ON public.psis_pesticide_products FROM anon, authenticated;
REVOKE ALL ON public.psis_pesticide_registrations FROM anon, authenticated;
REVOKE ALL ON public.psis_pesticide_media FROM anon, authenticated;
REVOKE ALL ON public.psis_pesticide_sync_runs FROM anon, authenticated;

GRANT SELECT ON public.psis_pesticide_products TO anon, authenticated;
GRANT SELECT ON public.psis_pesticide_registrations TO anon, authenticated;
GRANT SELECT ON public.psis_pesticide_media TO anon, authenticated;

GRANT ALL ON public.psis_pesticide_products TO service_role;
GRANT ALL ON public.psis_pesticide_registrations TO service_role;
GRANT ALL ON public.psis_pesticide_media TO service_role;
GRANT ALL ON public.psis_pesticide_sync_runs TO service_role;

COMMENT ON TABLE public.psis_pesticide_products IS
  'PSIS product master data collected from successful pesticide API responses.';

COMMENT ON TABLE public.psis_pesticide_registrations IS
  'PSIS crop, target, use method, dilution, and safety-use registrations.';

COMMENT ON TABLE public.psis_pesticide_media IS
  'Verified product image metadata. Binary assets may remain at their authoritative source.';

COMMENT ON TABLE public.psis_pesticide_sync_runs IS
  'Audit history for PSIS catalog collection attempts performed by trusted server code.';
