# Phase 16 Auth Persistence

## 목표

- Supabase Auth 기반 이메일/비밀번호 로그인을 추가한다.
- 브라우저 로컬 owner로 생성된 기존 필지 데이터를 로그인 사용자에게 귀속한다.
- 사용자가 다시 접속해도 필지, 작업 카드, 진단 기록, 상담 리포트, 타임라인, 알림 설정, 선택 필지를 이어서 사용하게 한다.

## 마이그레이션

- `supabase/migrations/20260508061753_auth_workspace_persistence.sql`

## DB 변경

- `user_preferences` 테이블 추가
  - `owner_id`: Supabase Auth 사용자 ID
  - `selected_field_id`: 마지막 선택 필지
  - `notification_settings`: 알림 설정 JSON
- `user_preferences` RLS 추가
  - 인증 사용자는 자신의 `owner_id = auth.uid()` 행만 조회/삽입/수정/삭제 가능
- `validate_user_preferences()` 트리거 추가
  - 설정 owner를 인증 사용자와 강제 일치
  - 선택 필지가 해당 사용자 소유인지 검증
- `claim_fieldguard_anonymous_workspace(anonymous_owner_id uuid)` RPC 추가
  - 인증 사용자가 로그인하면 기존 `fieldguard.owner.id` 헤더의 익명 필지 owner를 `auth.uid()`로 변경
  - `fields.owner_id`가 바뀌면 FK로 연결된 작업, 진단, 리포트, 타임라인은 기존 RLS 함수 `is_field_owner()` 기준으로 함께 이어진다.

## 프론트엔드 변경

- `/login` 라우트 추가
  - 이메일/비밀번호 로그인
  - 이메일/비밀번호 회원가입
  - 로그인 성공 후 원래 요청 경로 또는 `/dashboard`로 이동
- 보호 라우트 추가
  - 인증되지 않은 사용자는 `/login`으로 리다이렉트
- `AuthProvider` 추가
  - Supabase 세션 유지
  - 로그인 성공 시 익명 workspace 인수 RPC 호출
  - 로그아웃 시 React Query 캐시 정리
- 선택 필지 저장 방식 변경
  - 기존 localStorage 값을 fallback으로 유지
  - 로그인 사용자는 `user_preferences.selected_field_id`에 원격 저장
- 설정 화면 변경
  - 알림 스위치 값을 `user_preferences.notification_settings`에 저장
  - 계정 이메일/사용자 ID 및 로그아웃 제공
  - 필지 관리 목록에서 각 필지의 작물명을 `작물: ...` 배지로 명시 표시

## 저장 범위

- 필지: `fields`
- 작업 카드: `task_cards`
- 사진 진단 기록: `diagnosis_records`
- 상담 리포트: `reports`
- 타임라인: `timeline_items`
- 사용자 설정: `user_preferences`

현재 앱에는 별도 자유 대화/채팅 UI와 메시지 테이블이 없다. 따라서 이번 단계의 "대화" 지속성은 기존 상담 리포트 및 타임라인 기록 범위에서 처리한다.

## 검증

- `npm test -- src/services/authService.test.ts src/services/userPreferencesService.test.ts`
- `npm run build`

최종 검증에서는 전체 `npm test`를 실행한다.
