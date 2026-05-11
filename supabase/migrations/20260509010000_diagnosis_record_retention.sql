ALTER TABLE public.diagnosis_records
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.diagnosis_records
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

ALTER TABLE public.diagnosis_records
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '30 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_expires_at
  ON public.diagnosis_records(expires_at);

CREATE OR REPLACE FUNCTION public.delete_expired_diagnosis_records()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.diagnosis_records
  WHERE expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_diagnosis_records() FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'delete-expired-diagnosis-records'
    ) THEN
      PERFORM cron.unschedule('delete-expired-diagnosis-records');
    END IF;

    PERFORM cron.schedule(
      'delete-expired-diagnosis-records',
      '17 3 * * *',
      'SELECT public.delete_expired_diagnosis_records();'
    );
  END IF;
END;
$$;
