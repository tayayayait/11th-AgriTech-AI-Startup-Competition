# Phase 3 Edge Functions

## 목표

- 외부 API 키(`FARMMAP_API_KEY`, `KMA_SERVICE_KEY`, `NONGSARO_API_KEY`, `GEMINI_API_KEY`)를 프론트 코드에서 분리
- 공공 API/Gemini 호출을 Supabase Edge Function 프록시로 일원화
- 프론트는 `src/services/*Client.ts`만 사용하도록 호출 계층 정리

## 추가된 파일

```text
supabase/
  config.toml
  functions/
    _shared/http.ts
    farmmap-proxy/{index.ts, deno.json}
    kma-proxy/{index.ts, deno.json}
    nongsaro-proxy/{index.ts, deno.json}
    gemini-proxy/{index.ts, deno.json}

src/services/
  edgeInvoke.ts
  farmmapClient.ts
  kmaClient.ts
  nongsaroClient.ts
  geminiClient.ts
```

## 프록시 정책

1. 모든 프록시는 `POST` + JSON body만 허용 (`OPTIONS` CORS 응답 포함)
2. 업스트림 요청 실패 시 HTTP 상태와 함께 공통 오류 payload 반환
3. 업스트림 응답은 JSON이면 파싱, XML/기타는 `raw` 문자열로 전달
4. 타임아웃은 공통 유틸에서 강제(기본 12초, 최대 30초)

## 함수별 입력 스키마

### `farmmap-proxy`

```json
{
  "operation": "searchPnu | searchXY | searchRadius | searchAnalysisBasePnu",
  "params": { "pnu": "..." }
}
```

### `kma-proxy`

```json
{
  "endpoint": "ultraSrtNcst | ultraSrtFcst | vilageFcst",
  "params": {
    "base_date": "20260505",
    "base_time": "0500",
    "nx": 60,
    "ny": 127
  }
}
```

### `nongsaro-proxy`

```json
{
  "serviceName": "frcDsstrPrevnt",
  "operationName": "frcDsstrPrevntLst",
  "params": { "sYear": "2026", "sType": "all", "sText": "폭염" }
}
```

### `gemini-proxy`

```json
{
  "model": "gemini-2.5-flash",
  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "generationConfig": {}
}
```

## 필요한 Supabase Secret

```text
FARMMAP_API_KEY=
FARMMAP_DOMAIN=
KMA_SERVICE_KEY=
NONGSARO_API_KEY=
NONGSARO_CROP_EBOOK_API_KEY=
GEMINI_API_KEY=
```

선택값:

```text
FARMMAP_BASE_URL=
KMA_BASE_URL=
NONGSARO_BASE_URL=
GEMINI_BASE_URL=
GEMINI_MODEL=
```

## 실행/배포 체크

1. `supabase functions serve --env-file .env` 또는 Supabase Dashboard Secret 설정
2. `supabase functions deploy farmmap-proxy kma-proxy nongsaro-proxy gemini-proxy`
3. 프론트에서 `src/services/*Client.ts`를 통해 호출

## 남은 작업

- 현재는 프록시/클라이언트 스캐폴딩 완료 단계이며, 화면별 실제 연결은 phase4에서 진행
- 농사로 XML 응답 구조화 파싱은 서비스 레이어에서 후속 적용 필요
- KMA `base_date/base_time` 보정 로직(발표 시각 규칙)은 후속 구현 필요
