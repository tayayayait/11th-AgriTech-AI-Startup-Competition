# Phase 11 Supabase Deployment

## Deployment Target

- Project ref: `zlbuelcabafwtothdvno`
- Deployment date: 2026-05-06

## Completed

- Linked the local Supabase project to `zlbuelcabafwtothdvno`.
- Applied migrations `20260505070254` and `20260505074947` to the remote database.
- Regenerated `src/integrations/supabase/types.ts` from the linked remote schema.
- Uploaded `.env` values to Supabase Edge Function Secrets.
- Deployed `farmmap-proxy`, `kma-proxy`, `nongsaro-proxy`, and `gemini-proxy`.
- Fixed `nongsaro-proxy` invalid request handling so malformed requests return HTTP 400 instead of HTTP 500.

## Verification

- Remote REST returned HTTP 200 for:
  - `fields`
  - `task_cards`
  - `weather_risks`
  - `pest_risks`
  - `diagnosis_records`
  - `reports`
  - `pesticide_lookups`
  - `timeline_items`
- Edge Function CORS preflight returned HTTP 200 for:
  - `farmmap-proxy`
  - `kma-proxy`
  - `nongsaro-proxy`
  - `gemini-proxy`
