# Phase 9 Timeline + Security

## 목표

- 날씨 위험, 병해충 위험, 사진진단, 작업완료, 상담자료 생성 이력을 `timeline_items`에 저장한다.
- Supabase RLS를 `fields.owner_id` 기준으로 강화한다.
- 하위 데이터는 직접 owner 컬럼을 중복하지 않고 `field_id`가 가리키는 필지 owner로 접근 권한을 판정한다.
- 서버 전용 API 키가 프론트엔드 소스/빌드에 포함되지 않도록 검증한다.

## 구현 범위

### 타임라인 저장

- `src/domain/timeline/timelineItems.ts`
  - 날씨 위험: `weather_risks:{id}`
  - 병해충 위험: `pest_risks:{id}`
  - 사진진단: `diagnosis_records:{id}`
  - 작업완료: `task_cards:{id}`
  - 상담자료: `reports:{id}`
- `src/services/timelineService.ts`
  - `createTimelineItem`
  - `tryCreateTimelineItem`
  - `getTimelineItemsByField`
- 저장 연계 지점:
  - `weatherLiveService.ts`
  - `pestRiskForecastService.ts`
  - `diagnosisRecordService.ts`
  - `taskService.ts`
  - `reportService.ts`
- `src/pages/Dashboard.tsx`
  - 선택 필지의 최근 타임라인을 표시한다.

### 사용자 세션/소유권

- `src/integrations/supabase/client.ts`
  - 브라우저별 `fieldguard.owner.id` UUID를 만들고 Supabase 요청 헤더 `x-fieldguard-owner-id`로 보낸다.
- `src/services/authService.ts`
  - Supabase session이 있으면 `auth.uid()`를 사용하고, 없으면 브라우저별 owner UUID를 사용한다.
- `src/services/fieldService.ts`
  - 필지 조회/생성 전에 owner ID를 확보한다.
  - 필지 생성 시 `owner_id`를 현재 사용자 ID 또는 브라우저별 owner UUID로 저장한다.

### Supabase RLS

- Migration: `supabase/migrations/20260506084119_phase9_timeline_owner_rls.sql`
- Migration: `supabase/migrations/20260506085415_phase9_owner_header_fallback.sql`
- `fields`
  - `owner_id = current_fieldguard_owner_id()`인 행만 select/update/delete 가능
  - insert는 trigger로 owner_id를 채우고 동일 owner만 허용
- `weather_risks`, `pest_risks`, `task_cards`, `diagnosis_records`, `reports`, `timeline_items`
  - `public.is_field_owner(field_id)`가 true인 경우만 select/insert/update/delete 가능
- `pesticide_lookups`
  - 공식 참조 데이터이므로 read-only public select 유지

## 보안 검증

- 프론트엔드 소스에서 서버 전용 env 이름을 참조하지 않는 테스트 추가:
  - `src/services/securityBuild.test.ts`
- 서버 전용 키는 Supabase Edge Function의 `Deno.env`에서만 사용한다.
- Vite 프론트 빌드는 `VITE_` 접두사가 붙은 Supabase public 값만 사용한다.
- Edge Function CORS 허용 헤더에 `x-fieldguard-owner-id`를 추가해 owner 헤더가 프록시 호출을 차단하지 않게 했다.

## 운영상 주의

- Phase 9 RLS 적용 후 `owner_id`가 없는 기존 prototype 필지는 일반 사용자에게 보이지 않는다.
- 기존 데이터를 특정 사용자에게 귀속하려면 별도 운영 SQL로 `fields.owner_id`를 해당 사용자 UUID로 설정해야 한다.
- 현재 원격 Supabase에서 Anonymous Sign-ins와 guest email signup이 비활성/제한되어 있어 브라우저별 owner UUID fallback을 사용한다.
- 이 fallback은 사용자별 데이터 분리에는 동작하지만, 강한 인증 보안은 아니다. 운영 버전에서는 Supabase Auth 로그인 또는 Anonymous Sign-ins 활성화가 필요하다.

## 검증 명령

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run api:smoke`
- `npx supabase db push --dry-run`
- `npx supabase db push --yes`
- `npx supabase db query --linked "... pg_policies ..."`
