CREATE OR REPLACE FUNCTION public.current_fieldguard_owner_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  raw_headers TEXT;
  header_owner_id TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid();
  END IF;

  raw_headers := current_setting('request.headers', true);
  IF raw_headers IS NULL OR raw_headers = '' THEN
    RETURN NULL;
  END IF;

  header_owner_id := raw_headers::jsonb ->> 'x-fieldguard-owner-id';
  IF header_owner_id IS NULL OR header_owner_id = '' THEN
    RETURN NULL;
  END IF;

  RETURN header_owner_id::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_field_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := public.current_fieldguard_owner_id();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.owner_id := OLD.owner_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_field_owner(target_field_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_field_id IS NOT NULL
    AND public.current_fieldguard_owner_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.fields
      WHERE id = target_field_id
        AND owner_id = public.current_fieldguard_owner_id()
    );
$$;

DROP POLICY IF EXISTS "owner select fields" ON public.fields;
DROP POLICY IF EXISTS "owner insert fields" ON public.fields;
DROP POLICY IF EXISTS "owner update fields" ON public.fields;
DROP POLICY IF EXISTS "owner delete fields" ON public.fields;

DROP POLICY IF EXISTS "owner select weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner insert weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner update weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner delete weather" ON public.weather_risks;

DROP POLICY IF EXISTS "owner select pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner insert pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner update pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner delete pest" ON public.pest_risks;

DROP POLICY IF EXISTS "owner select tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner insert tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner update tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner delete tasks" ON public.task_cards;

DROP POLICY IF EXISTS "owner select diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner insert diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner update diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner delete diagnosis" ON public.diagnosis_records;

DROP POLICY IF EXISTS "owner select reports" ON public.reports;
DROP POLICY IF EXISTS "owner insert reports" ON public.reports;
DROP POLICY IF EXISTS "owner update reports" ON public.reports;
DROP POLICY IF EXISTS "owner delete reports" ON public.reports;

DROP POLICY IF EXISTS "owner select timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner insert timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner update timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner delete timeline" ON public.timeline_items;

CREATE POLICY "owner select fields" ON public.fields
  FOR SELECT TO anon, authenticated
  USING (owner_id = public.current_fieldguard_owner_id());

CREATE POLICY "owner insert fields" ON public.fields
  FOR INSERT TO anon, authenticated
  WITH CHECK (owner_id = public.current_fieldguard_owner_id());

CREATE POLICY "owner update fields" ON public.fields
  FOR UPDATE TO anon, authenticated
  USING (owner_id = public.current_fieldguard_owner_id())
  WITH CHECK (owner_id = public.current_fieldguard_owner_id());

CREATE POLICY "owner delete fields" ON public.fields
  FOR DELETE TO anon, authenticated
  USING (owner_id = public.current_fieldguard_owner_id());

CREATE POLICY "owner select weather" ON public.weather_risks
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert weather" ON public.weather_risks
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update weather" ON public.weather_risks
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete weather" ON public.weather_risks
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select pest" ON public.pest_risks
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert pest" ON public.pest_risks
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update pest" ON public.pest_risks
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete pest" ON public.pest_risks
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select tasks" ON public.task_cards
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert tasks" ON public.task_cards
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update tasks" ON public.task_cards
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete tasks" ON public.task_cards
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select diagnosis" ON public.diagnosis_records
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert diagnosis" ON public.diagnosis_records
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update diagnosis" ON public.diagnosis_records
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete diagnosis" ON public.diagnosis_records
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select reports" ON public.reports
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert reports" ON public.reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update reports" ON public.reports
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete reports" ON public.reports
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select timeline" ON public.timeline_items
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert timeline" ON public.timeline_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update timeline" ON public.timeline_items
  FOR UPDATE TO anon, authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete timeline" ON public.timeline_items
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));
