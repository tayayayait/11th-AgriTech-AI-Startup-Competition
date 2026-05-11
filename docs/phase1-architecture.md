# Phase 1 Architecture Update

## 목표

- UI 레이어에서 Supabase 직접 호출 제거
- `domain`/`services` 계층 분리
- 위험도 기준 상세서 반영 (`40/70/90`)
- AI 금지 문구 필터 유틸 도입
- 디자인 토큰 파일을 `src/styles/tokens.css`로 분리

## 추가된 디렉터리/파일

```text
src/
  domain/
    ai/safety.ts
    fields/types.ts
    risk/risk.ts
    tasks/types.ts
  services/
    dashboardService.ts
    fieldService.ts
    reportService.ts
    taskService.ts
  styles/
    tokens.css
```

## 레이어 책임

1. `domain`
2. `services`
3. `pages`/`context`

`domain`은 타입/규칙만 다룬다.  
`services`는 Supabase 조회/변환만 담당한다.  
`pages`와 `context`는 오직 `services`를 호출한다.

## 위험도 기준

`src/domain/risk/risk.ts`에서 점수 기준을 고정했다.

- `watch`: 40 이상
- `high`: 70 이상
- `critical`: 90 이상

## AI 문구 안전성

`src/domain/ai/safety.ts`를 추가했다.

- 금지 표현 탐지: `containsForbiddenAiPhrase`
- 단건 정제: `sanitizeAiText`
- 목록 정제: `sanitizeAiTextList`

현재 `Diagnosis` 화면의 표시 텍스트는 렌더링 전 정제된다.

## 스타일 토큰

CSS 변수는 `src/styles/tokens.css`로 분리하고 `src/main.tsx`에서 먼저 로드한다.

## 후속 작업

1. `services`에서 공공 API(팜맵/KMA/농사로/Gemini) 클라이언트로 확장
2. `TaskStatus`, `DiagnosisStatus`, `SourceStatus`를 DB 제약 및 UI 상태머신으로 연결
3. 경고(`react-refresh/only-export-components`, `react-hooks/exhaustive-deps`) 정리

## Phase 1 API Adapter 정리

공공 API 프록시 호출 경계를 `src/services/api`로 정리했다.

```text
src/services/api/
  types.ts
  errors.ts
  edgeAdapter.ts
```

### 공통 규칙

- 외부 API 클라이언트는 `invokeEdgeFunction`을 직접 호출하지 않고 `invokeApiAdapter`를 통한다.
- 어댑터 오류는 `ApiAdapterError`로 변환해 `source`, `code`, `details`를 유지한다.
- 요청 파라미터 타입은 `ApiRequestParams`로 통일한다.
- API별 클라이언트는 프록시 envelope을 그대로 화면 서비스에 흘리지 않고, 가능한 범위에서 1차 파싱을 끝낸다.

### API별 경계

- `nongsaroClient`: 농사로 XML을 `NongsaroParsedResponse`로 파싱하고 `items/resultCode/resultMsg`를 노출한다.
- `kmaClient`: 기상청 응답에서 `item[]`을 추출하고, 비정상 `resultCode`는 어댑터 오류로 올린다.
- `farmmapClient`: Farmmap operation과 proxy envelope 타입을 통일하고, SDK script 조회도 동일 어댑터를 통한다.
- `geminiClient`: Gemini proxy 호출을 공통 어댑터로 연결한다. JSON schema 정규화는 `domain/ai/diagnosis.ts`에서 유지한다.

### 의도적으로 남긴 raw payload

- Farmmap 데이터 API는 응답 필드명이 operation별로 달라 `farmmapService`에서 후보 객체를 탐색한다.
- Gemini 응답은 모델 응답 구조가 필요하므로 `diagnosisService`가 raw `data`를 `parseDiagnosisFromGeminiResponse`에 넘긴다.
