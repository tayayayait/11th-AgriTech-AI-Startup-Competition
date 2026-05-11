CREATE TABLE IF NOT EXISTS public.user_preferences (
  owner_id UUID PRIMARY KEY DEFAULT auth.uid(),
  selected_field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  notification_settings JSONB NOT NULL DEFAULT '{
    "weatherRisk": true,
    "pestRisk": true,
    "taskReminder": true
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_selected_field_id
  ON public.user_preferences(selected_field_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.owner_id := OLD.owner_id;
  END IF;

  IF NEW.owner_id IS NULL OR NEW.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'user preference owner must match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.selected_field_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.fields
      WHERE id = NEW.selected_field_id
        AND owner_id = NEW.owner_id
    )
  THEN
    RAISE EXCEPTION 'selected field is not owned by authenticated user'
      USING ERRCODE = '42501';
  END IF;

  NEW.notification_settings := COALESCE(NEW.notification_settings, '{}'::jsonb);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_user_preferences_trigger ON public.user_preferences;

CREATE TRIGGER validate_user_preferences_trigger
BEFORE INSERT OR UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_preferences();

DROP POLICY IF EXISTS "owner select user preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "owner insert user preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "owner update user preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "owner delete user preferences" ON public.user_preferences;

CREATE POLICY "owner select user preferences" ON public.user_preferences
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner insert user preferences" ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner update user preferences" ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner delete user preferences" ON public.user_preferences
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_fieldguard_anonymous_workspace(anonymous_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_headers TEXT;
  header_owner_id TEXT;
  claimed_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF anonymous_owner_id IS NULL OR anonymous_owner_id = auth.uid() THEN
    RETURN jsonb_build_object('claimed_fields', 0);
  END IF;

  raw_headers := current_setting('request.headers', true);
  IF raw_headers IS NULL OR raw_headers = '' THEN
    RAISE EXCEPTION 'anonymous owner header required'
      USING ERRCODE = '42501';
  END IF;

  header_owner_id := NULLIF(raw_headers::jsonb ->> 'x-fieldguard-owner-id', '');
  IF header_owner_id IS NULL OR header_owner_id::UUID <> anonymous_owner_id THEN
    RAISE EXCEPTION 'anonymous owner header mismatch'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.fields
  SET owner_id = auth.uid(),
      updated_at = now()
  WHERE owner_id = anonymous_owner_id;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;

  RETURN jsonb_build_object('claimed_fields', claimed_count);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fieldguard_anonymous_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fieldguard_anonymous_workspace(UUID) TO authenticated;
