CREATE TABLE IF NOT EXISTS public.consultation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '새 상담',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

ALTER TABLE public.consultation_threads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_consultation_threads_field_updated_at
  ON public.consultation_threads(field_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultation_threads_expires_at
  ON public.consultation_threads(expires_at);

CREATE POLICY "Users can view consultation threads for owned fields"
  ON public.consultation_threads
  FOR SELECT
  USING (public.is_field_owner(field_id));

CREATE POLICY "Users can create consultation threads for owned fields"
  ON public.consultation_threads
  FOR INSERT
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "Users can update consultation threads for owned fields"
  ON public.consultation_threads
  FOR UPDATE
  USING (public.is_field_owner(field_id))
  WITH CHECK (public.is_field_owner(field_id));

CREATE POLICY "Users can delete consultation threads for owned fields"
  ON public.consultation_threads
  FOR DELETE
  USING (public.is_field_owner(field_id));

ALTER TABLE public.consultation_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.consultation_threads(id) ON DELETE CASCADE;

WITH legacy_threads AS (
  INSERT INTO public.consultation_threads (
    field_id,
    title,
    created_at,
    updated_at,
    expires_at
  )
  SELECT
    field_id,
    '기존 상담 기록',
    min(created_at),
    max(created_at),
    max(created_at) + INTERVAL '30 days'
  FROM public.consultation_messages
  WHERE thread_id IS NULL
  GROUP BY field_id
  RETURNING id, field_id
)
UPDATE public.consultation_messages AS message
SET thread_id = legacy_threads.id
FROM legacy_threads
WHERE message.thread_id IS NULL
  AND message.field_id = legacy_threads.field_id;

ALTER TABLE public.consultation_messages
  ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consultation_messages_thread_created_at
  ON public.consultation_messages(thread_id, created_at ASC);

DROP POLICY IF EXISTS "Users can create consultation messages for owned fields"
  ON public.consultation_messages;
DROP POLICY IF EXISTS "owner insert consultation messages"
  ON public.consultation_messages;

CREATE POLICY "Users can create consultation messages for owned fields"
  ON public.consultation_messages
  FOR INSERT
  WITH CHECK (
    public.is_field_owner(field_id)
    AND EXISTS (
      SELECT 1
      FROM public.consultation_threads
      WHERE consultation_threads.id = consultation_messages.thread_id
        AND consultation_threads.field_id = consultation_messages.field_id
    )
  );

CREATE OR REPLACE FUNCTION public.purge_expired_consultation_threads()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.consultation_threads
  WHERE expires_at <= now();
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION
  WHEN insufficient_privilege OR undefined_file THEN
    RAISE NOTICE 'pg_cron extension is unavailable in this environment.';
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-consultation-threads') THEN
      PERFORM cron.unschedule('purge-expired-consultation-threads');
    END IF;

    PERFORM cron.schedule(
      'purge-expired-consultation-threads',
      '15 3 * * *',
      'SELECT public.purge_expired_consultation_threads();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron scheduling skipped.';
END;
$$;
