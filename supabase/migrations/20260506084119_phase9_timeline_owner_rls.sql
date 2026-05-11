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

CREATE OR REPLACE FUNCTION public.set_field_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.owner_id := OLD.owner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_field_owner_id_trigger ON public.fields;

CREATE TRIGGER set_field_owner_id_trigger
BEFORE INSERT OR UPDATE ON public.fields
FOR EACH ROW
EXECUTE FUNCTION public.set_field_owner_id();

CREATE OR REPLACE FUNCTION public.is_field_owner(target_field_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_field_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.fields
      WHERE id = target_field_id
        AND owner_id = auth.uid()
    );
$$;

ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pest_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnosis_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesticide_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read fields" ON public.fields;
DROP POLICY IF EXISTS "public write fields" ON public.fields;
DROP POLICY IF EXISTS "public insert fields" ON public.fields;
DROP POLICY IF EXISTS "public update fields" ON public.fields;
DROP POLICY IF EXISTS "public delete fields" ON public.fields;
DROP POLICY IF EXISTS "owner select fields" ON public.fields;
DROP POLICY IF EXISTS "owner insert fields" ON public.fields;
DROP POLICY IF EXISTS "owner update fields" ON public.fields;
DROP POLICY IF EXISTS "owner delete fields" ON public.fields;

DROP POLICY IF EXISTS "public read weather" ON public.weather_risks;
DROP POLICY IF EXISTS "public write weather" ON public.weather_risks;
DROP POLICY IF EXISTS "public insert weather" ON public.weather_risks;
DROP POLICY IF EXISTS "public update weather" ON public.weather_risks;
DROP POLICY IF EXISTS "public delete weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner select weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner insert weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner update weather" ON public.weather_risks;
DROP POLICY IF EXISTS "owner delete weather" ON public.weather_risks;

DROP POLICY IF EXISTS "public read pest" ON public.pest_risks;
DROP POLICY IF EXISTS "public write pest" ON public.pest_risks;
DROP POLICY IF EXISTS "public insert pest" ON public.pest_risks;
DROP POLICY IF EXISTS "public update pest" ON public.pest_risks;
DROP POLICY IF EXISTS "public delete pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner select pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner insert pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner update pest" ON public.pest_risks;
DROP POLICY IF EXISTS "owner delete pest" ON public.pest_risks;

DROP POLICY IF EXISTS "public read tasks" ON public.task_cards;
DROP POLICY IF EXISTS "public write tasks" ON public.task_cards;
DROP POLICY IF EXISTS "public insert tasks" ON public.task_cards;
DROP POLICY IF EXISTS "public update tasks" ON public.task_cards;
DROP POLICY IF EXISTS "public delete tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner select tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner insert tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner update tasks" ON public.task_cards;
DROP POLICY IF EXISTS "owner delete tasks" ON public.task_cards;

DROP POLICY IF EXISTS "public read diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "public write diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "public insert diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "public update diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "public delete diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner select diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner insert diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner update diagnosis" ON public.diagnosis_records;
DROP POLICY IF EXISTS "owner delete diagnosis" ON public.diagnosis_records;

DROP POLICY IF EXISTS "public read reports" ON public.reports;
DROP POLICY IF EXISTS "public write reports" ON public.reports;
DROP POLICY IF EXISTS "public insert reports" ON public.reports;
DROP POLICY IF EXISTS "public update reports" ON public.reports;
DROP POLICY IF EXISTS "public delete reports" ON public.reports;
DROP POLICY IF EXISTS "owner select reports" ON public.reports;
DROP POLICY IF EXISTS "owner insert reports" ON public.reports;
DROP POLICY IF EXISTS "owner update reports" ON public.reports;
DROP POLICY IF EXISTS "owner delete reports" ON public.reports;

DROP POLICY IF EXISTS "public read timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public insert timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public update timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "public delete timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner select timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner insert timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner update timeline" ON public.timeline_items;
DROP POLICY IF EXISTS "owner delete timeline" ON public.timeline_items;

CREATE POLICY "owner select fields" ON public.fields
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner insert fields" ON public.fields
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner update fields" ON public.fields
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner delete fields" ON public.fields
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner select weather" ON public.weather_risks
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert weather" ON public.weather_risks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update weather" ON public.weather_risks
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete weather" ON public.weather_risks
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select pest" ON public.pest_risks
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert pest" ON public.pest_risks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update pest" ON public.pest_risks
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete pest" ON public.pest_risks
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select tasks" ON public.task_cards
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert tasks" ON public.task_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update tasks" ON public.task_cards
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete tasks" ON public.task_cards
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select diagnosis" ON public.diagnosis_records
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert diagnosis" ON public.diagnosis_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update diagnosis" ON public.diagnosis_records
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete diagnosis" ON public.diagnosis_records
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select reports" ON public.reports
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete reports" ON public.reports
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner select timeline" ON public.timeline_items
  FOR SELECT TO authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert timeline" ON public.timeline_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner update timeline" ON public.timeline_items
  FOR UPDATE TO authenticated
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete timeline" ON public.timeline_items
  FOR DELETE TO authenticated
  USING (public.is_field_owner(field_id));

DROP POLICY IF EXISTS "public read pesticide" ON public.pesticide_lookups;
CREATE POLICY "public read pesticide" ON public.pesticide_lookups
  FOR SELECT TO anon, authenticated
  USING (true);
