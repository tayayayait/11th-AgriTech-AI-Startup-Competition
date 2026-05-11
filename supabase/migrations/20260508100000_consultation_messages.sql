CREATE TABLE IF NOT EXISTS public.consultation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_messages_field_created_at
  ON public.consultation_messages(field_id, created_at DESC);

ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner select consultation messages" ON public.consultation_messages;
DROP POLICY IF EXISTS "owner insert consultation messages" ON public.consultation_messages;
DROP POLICY IF EXISTS "owner delete consultation messages" ON public.consultation_messages;

CREATE POLICY "owner select consultation messages" ON public.consultation_messages
  FOR SELECT TO anon, authenticated
  USING (public.is_field_owner(field_id));

CREATE POLICY "owner insert consultation messages" ON public.consultation_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "owner delete consultation messages" ON public.consultation_messages
  FOR DELETE TO anon, authenticated
  USING (public.is_field_owner(field_id));
