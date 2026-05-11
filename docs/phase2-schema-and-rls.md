# Phase 2 Schema and RLS

## 목표

- 데이터 상태값을 enum으로 고정
- 필지 메타데이터/추적 필드를 확장
- 타임라인 테이블 추가
- 인덱스와 제약조건 추가
- RLS 정책을 `FOR ALL`에서 작업별 정책으로 분리

## 생성된 마이그레이션

- `supabase/migrations/20260505074947_phase2_schema_hardening.sql`

## 주요 변경

1. Enum 타입 추가
- `risk_level_enum`
- `task_status_enum`
- `source_status_enum`
- `diagnosis_status_enum`
- `confidence_band_enum`
- `timeline_item_type_enum`

2. `fields` 확장
- `pnu`, `farmmap_meta`, `owner_id` 컬럼 추가
- `pnu` 19자리 숫자 체크 제약
- 위도/경도 범위 제약
- `risk_level`을 enum 타입으로 전환 (`40/70/90` 기준 보정)

3. `task_cards` 전환
- `status`를 `task_status_enum`으로 전환

4. `weather_risks` 확장
- `source_status`, `collected_at` 추가

5. `diagnosis_records` 확장
- `status`, `limitations`, `recommended_photos` 추가
- `confidence_band` enum 전환

6. 타임라인 테이블 추가
- `timeline_items` 생성
- `(field_id, created_at)` 인덱스 추가

7. 인덱스 보강
- `fields(owner_id)`, `fields(pnu)`
- `weather_risks(field_id, forecast_at)`
- `task_cards(field_id, status, priority)`

8. RLS 정책 정리
- 기존 `public write ... FOR ALL` 정책 제거
- 각 테이블에 `insert/update/delete` 정책 분리 생성
- `timeline_items` RLS 및 정책 추가

## 현재 적용 상태

- 로컬 마이그레이션 파일 작성 완료
- 실제 원격 DB 반영은 실패

실패 원인:
- `npx supabase db push` 실행 시 프로젝트 링크/권한 부족
- `npx supabase link`, `npx supabase gen types` 모두 계정 권한 부족 에러

## 후속 필요 작업

1. Supabase 프로젝트 권한이 있는 계정으로 `supabase link` 수행
2. `npx supabase db push`로 마이그레이션 적용
3. `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`로 타입 재생성

## Phase 2 필지 등록 완성

필지 등록 화면의 임시 좌표 fallback을 제거했다. 이제 주소/PNU/지도 클릭/좌표 등록 모두 실제 위도·경도 범위 검증을 통과해야 저장된다.

### 구현 내용

- PNU 조회는 Farmmap `searchPnu` 결과를 단일 후보라도 선택 가능한 후보 카드로 표시한다.
- Farmmap `geometry`의 EPSG:5179 좌표를 WGS84 위도·경도로 변환해 저장한다.
- 저장 payload:
  - `pnu`: Farmmap 대표 PNU
  - `address`: Farmmap 법정동주소 또는 사용자가 입력한 주소
  - `area_m2`: Farmmap 면적. 수동 좌표는 임의값 대신 `0`
  - `farmmap_meta.classification`: 농경지분류
  - `farmmap_meta.legalDongAddress`: 법정동주소
  - `farmmap_meta.raw`: 원본 후보 객체
- 지도 클릭 등록은 `FarmmapView`의 클릭 이벤트에서 WGS84 좌표를 추출하고, Farmmap `searchXY`로 PNU/면적/분류를 보강한다.
- 등록 성공 시 React Query의 `fields`, `fields-all` 캐시를 즉시 갱신하고 방금 만든 필지를 선택한 뒤 대시보드로 이동한다.

### 브라우저 검증

- `http://10.98.195.97:8080/fields/new`에서 PNU `3611031024201550000` 조회 확인
- 단일 후보가 `세종특별자치시 연기면 수산리`, `밭`, `3,965.048㎡`, 좌표 `36.5484105, 127.2381182`로 표시됨
- 테스트 필지 등록 후 대시보드와 필지 지도에 즉시 반영 확인
- 검증 후 테스트 필지 `Phase2 테스트 1603` 삭제 완료
