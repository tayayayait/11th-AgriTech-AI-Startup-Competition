# Phase 8 Pesticide Safety + Consultation Report

## 목표

- 병해충/사진 판독 결과에서 농약 등록정보와 농사로 농약안전사용지침 문서로 바로 이동한다.
- 농사로 `agchmSafeManualList` 응답을 공식 지침 문서 접근용 근거로 연결한다.
- 농약안전정보시스템 `SVC01/SVC02` 응답을 공식 등록 농약 후보와 안전사용기준 확인용 근거로 연결한다.
- 상담 리포트 화면에서 브라우저 인쇄 기능을 통해 PDF 저장 또는 인쇄가 가능하게 한다.
- 수확 전 사용기간, 사용횟수, 희석배수는 PSIS 공식 응답에 있는 값만 표시하고 임의 조정하지 않는다.

## 구현 범위

### 농약안전사용지침 연결

- `supabase/functions/psis-proxy/index.ts`
  - `PSIS_API_KEY`를 서버 측에서만 주입하고 `SVC01`, `SVC02`만 허용한다.
  - PSIS XML 응답을 `service.list` 기반 JSON으로 정규화한다.
- `src/services/psisPesticideRegistrationService.ts`
  - 작물명, 병해충명/적용대상, 품목명/상표명 조건으로 등록 농약 후보를 조회한다.
  - 품목명 검색 결과가 없으면 같은 입력값으로 상표명 검색을 보조 수행한다.
  - `pestiUse`, `dilutUnit`, `useSuittime`, `useNum`을 공식 원문 값으로 표시하고, 일수/횟수 필터는 파싱 가능한 숫자에만 적용한다.
- `src/services/nongsaroPesticideService.ts`
  - `agchmSafeManualList`를 사용해 작물명(`sPrdlstCodeNm`)과 제목 키워드(`sCntntsSj`)로 공식 지침 문서를 조회한다.
  - 병해충명/농약명 조건 조회 결과가 0건이면 작물명 단독 조회로 fallback한다.
  - 파일 URL은 농사로 URL 정규화 로직을 거쳐 `fileUrl`로 제공한다.
- `src/domain/pesticide/pesticideGuideLinks.ts`
  - 진단 후보에서 `/reports?tab=pesticide&crop=...&target=...&item=...` 링크를 생성한다.
- `src/pages/Diagnosis.tsx`
  - 사진 판독 후보 카드의 “등록농약 후보/안전정보 확인” 링크가 농약 안전/등록정보 탭으로 이동한다.
  - 사진 판독 후보 카드 안에 PSIS 공식 등록농약 후보 3건 요약을 바로 표시한다.
  - 요약에는 상표명, 품목명, 사용방법, 희석배수/10a당 사용량, 수확 전 기준, 사용횟수를 표시한다.
  - 요약 패널에는 `확정 진단/자동 처방이 아님` 제한 문구와 전체 등록정보 보기 링크를 함께 둔다.
- `src/pages/Reports.tsx`
  - URL query의 `crop`, `target`, `item` 값을 등록 농약 후보와 농약 지침 검색 필터 초기값으로 반영한다.
  - `병해충명을 알아요`, `공식 사진에서 고르기`, `내 사진으로 찾기` 모드를 제공한다.
  - `공식 사진에서 고르기`는 NCPMS `SVC13` 공식 이미지 후보를 보여주고, 사용자가 선택한 후보명을 PSIS `diseaseWeedName` 조회 조건으로 반영한다.
  - NCPMS 공식 이미지 후보는 한 화면에 최대 8개까지만 번호형 목록으로 표시하고, 각 항목에는 이미지와 API 식별값을 함께 노출한다. 후보 목록 영역에서 Ctrl+마우스휠로 사진 카드 크기를 조정할 수 있다.
  - `내 사진으로 찾기`는 기존 사진 판독 화면으로 이동시켜 NCPMS 후보 비교 후 다시 등록정보 탭으로 연결하는 흐름을 사용한다.

### 상담 리포트/PDF/인쇄

- `src/domain/reports/consultationReportExport.ts`
  - 인쇄 전 “브라우저 인쇄 창에서 PDF 저장 또는 인쇄를 선택하세요.” 안내를 표시한다.
  - 실제 PDF 파일 생성 라이브러리는 도입하지 않고 브라우저 기본 인쇄/저장 기능을 사용한다.
- `src/pages/Reports.tsx`
  - 상담 리포트의 `인쇄`, `PDF 내보내기` 버튼이 동일하게 `window.print()`를 호출한다.
  - 공유 링크와 리포트 생성 기능은 기존 동작을 유지한다.

## 명시적 한계

- `agchmSafeManualList`는 공식 지침 문서 목록/첨부 접근에는 사용할 수 있다.
- PSIS 등록정보는 작물·적용대상별 공식 후보 확인용이다. 확정 진단, 자동 처방, 농약 우선순위 추천으로 사용하지 않는다.
- NCPMS 공식 사진 선택은 병해충명을 모르는 사용자를 위한 후보 좁히기 단계다. 사진 유사도만으로 병해충을 확정하지 않는다.
- 희석배수/사용량은 `dilutUnit` 원문을 그대로 표시한다. 사용자가 물량/면적을 입력해 계산하는 기능은 현재 범위에 없다.
- 화면 문구는 자동 처방이 아니라 공식 등록정보/지침 확인과 상담 리포트 보조 기능으로 제한한다.

## 완료 기준 검증

- 병해충/진단 후보에서 농약 안전/등록정보 탭으로 이동 가능한 링크가 생성된다.
- `/reports?tab=pesticide&crop=벼&target=깨씨무늬병` 접근 시 농약 안전/등록정보 탭이 열리고 PSIS 등록 농약 후보와 농사로 지침 검색 필터가 채워진다.
- 사진 판독 후보 카드에서 PSIS 공식 등록농약 후보 요약이 바로 표시된다.
- 병해충명을 모르는 경우 작물명 기준 NCPMS 공식 사진 후보를 선택해 PSIS 등록 농약 후보 조회 조건을 채울 수 있다.
- 병해충명 직접 조회 결과가 없더라도 작물명 fallback으로 관련 공식 지침 문서가 표시된다.
- 상담 리포트 화면의 `인쇄`, `PDF 내보내기` 버튼이 브라우저 인쇄 흐름을 실행한다.

## 검증 명령

- `npm test -- src/domain/pesticide/pesticideGuideLinks.test.ts src/services/nongsaroPesticideService.test.ts src/services/psisPesticideRegistrationService.test.ts src/domain/reports/consultationReportExport.test.ts`
- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run api:smoke`

## 2026-05-11 추가 변경: PSIS 후보 대표 정리

- `src/services/psisPesticideRecommendationService.ts`를 추가해 PSIS `SVC01` 목록 결과를 상표 단위 그대로 노출하지 않고, 같은 작물/적용대상/품목/주성분/사용방법/희석배수/수확 전 기준/사용횟수 기준으로 먼저 묶는다.
- 묶인 후보가 5개를 초과하면 `gemini-proxy`를 통해 Gemini가 공식 등록정보 안에서 대표 3~5개 그룹을 선택한다.
- Gemini는 새 농약명, 새 사용법, 새 희석비율, 새 안전기준을 만들 수 없고 제공된 `groupId`만 선택한다.
- 화면에서는 `작용기작 아5+사1` 같은 원문 코드를 직접 강조하지 않고, 초보 농업인이 이해할 수 있도록 `먼저 확인할 이유`, `사용 기준`, `수확 전 안전 기준`, `같은 기준으로 묶인 상표`로 표시한다.
- Gemini 요약이 실패하면 공식 등록정보 기준으로 중복 묶음 후보를 표시한다. 이 경우도 자동 처방이나 추천 순위로 표현하지 않는다.
