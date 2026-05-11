# Phase 4 Live Integration

## 목표

- Phase 3에서 만든 Edge Function 프록시를 실제 화면 흐름에 연결
- Gemini 응답을 JSON 스키마 기반으로 검증 후 UI에 반영
- PNU 기반 팜맵 조회 결과를 필지 등록 입력값에 반영

## 적용 범위

### 1) 사진 판독 실연동

- 추가 파일:
  - `src/domain/ai/diagnosis.ts`
  - `src/services/diagnosisService.ts`
- 수정 파일:
  - `src/pages/Diagnosis.tsx`

구현 내용:

1. Gemini 응답(JSON) 파싱 및 검증
   - 코드펜스(````json`) 제거
   - `candidates -> content -> parts -> text` 경로 추출
   - JSON 파싱 후 정규화/검증
2. 금지 문구/안전 문구 정리
   - `sanitizeAiText`, `sanitizeAiTextList` 재사용
3. 상태값 도입
   - `ready`, `uploading`, `analyzing`, `needs_more_photo`, `completed`, `limited`, `failed`
4. UI 반영
   - 분석 상태 메시지
   - 의심 후보/판단근거/기상근거/추가확인
   - 불확실성/추가촬영/현장 체크리스트
5. 업로드 검증
   - 형식: JPG/PNG/WEBP
   - 크기: 10MB 이하
   - 장수: 최대 5장

### 2) 필지 등록 팜맵 연동

- 추가 파일:
  - `src/domain/farmmap/types.ts`
  - `src/services/farmmapService.ts`
- 수정 파일:
  - `src/pages/FieldNew.tsx`

구현 내용:

1. PNU 입력 후 팜맵 조회 버튼 추가
2. 조회 결과 후보를 최대 5건 목록으로 표시
3. 선택한 후보의 주소/좌표(가능 시)를 입력값에 반영
4. 필지 등록 시 좌표 미입력인 경우 안내

## 공통 보강

- 수정 파일: `src/services/edgeInvoke.ts`
- 내용:
  - `FunctionsHttpError`, `FunctionsRelayError`, `FunctionsFetchError` 분기 처리
  - Edge Function HTTP 오류 응답(JSON/text) 파싱 후 사용자 오류로 변환

## 검증 결과

- `npm run lint`: 통과 (기존 경고 8건 유지)
- `npx tsc --noEmit`: 통과
- `npm test`: 통과
- `npm run build`: 환경 이슈로 실패(`node` 비정상 종료, exit `-1073740791`)

## 남은 작업

1. 팜맵 응답 구조 고정 스펙 확보 후 필드 매핑 정밀화
2. 농사로 XML 응답 구조화 파서 추가
3. 기상청 `base_date/base_time` 자동 보정 로직 구현
4. Edge Function 배포/secret 설정 후 실환경 E2E 검증
