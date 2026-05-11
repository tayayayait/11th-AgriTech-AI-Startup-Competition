# Phase 15 Photo Diagnosis Stabilization

## 목표

Gemini 사진 판독 결과를 안정적으로 JSON 파싱하고, 의심 후보를 농사로 병해충 발생정보와 비교한 뒤 현장 체크리스트와 함께 저장한다.

## 구현 범위

- `src/domain/ai/diagnosis.ts`
  - Gemini 응답 JSON schema 단순화
  - 작물 공통 `appearanceAssessment` 추가
  - 부패, 곰팡이, 변색, 상처/터짐, 시듦/마름, 해충 피해 흔적, 촬영 품질 제한 같은 외관/상품성 이상을 NCPMS 병해충 후보와 분리
  - `confidence`, `reasons`, `checks`, `photos`, `checklist` 형태의 짧은 JSON 키 수용
  - 기존 `confidenceBand`, `visualReasons`, `nextChecks`, `recommendedPhotos`, `fieldChecklist` 형태도 계속 수용
  - 후보별 `officialSources` 필드 추가
- `src/services/diagnosisService.ts`
  - 1차 Gemini가 사진만 보고 작물 공통 외관/상품성 이상을 분석
  - 2차로 NCPMS 후보를 조회하고 1차 외관 라벨/근거와 후보 텍스트 기준으로 우선순위 정렬
  - 촬영 부위와 1차 외관 분석에서 식물 부위를 추론해 잎·가지·줄기 전용 후보가 열매 사진 결과에 노출되지 않도록 필터링
  - NCPMS 상세 증상에 여러 부위가 섞인 경우에도 촬영 부위 관련 표현이 다른 부위 표현보다 적으면 후보에서 제외
  - 3차 Gemini가 사진, 1차 외관 분석, NCPMS 공식 후보 목록을 비교해 후보 ID 안에서만 최종 후보 선택
  - 후보 조회 범위를 16개로 넓히고 1차 외관 라벨/근거와 후보명·상세 증상 텍스트가 겹치는 후보를 먼저 비교
  - Gemini 비교와 Gemini 재판단이 모두 빈 후보를 반환해도 외관 근거와 NCPMS 텍스트가 기준 이상 겹치면 낮은 신뢰도의 공식 후보를 결정론적으로 제시
  - NCPMS 후보가 0개여도 1차 Gemini 외관 스크리닝 결과는 유지
  - 1차 `maxOutputTokens=1200`, 2차 `maxOutputTokens=1800`
  - JSON 파싱 실패 시 1회 재시도
  - Gemini `finishReason=MAX_TOKENS` 응답 시 1회 재시도
  - 재시도 프롬프트는 더 짧고 완전한 JSON을 요구
- `src/domain/ai/diagnosisEvidence.ts`
  - AI 후보명과 농사로 병해충 발생정보 제목 직접 비교
  - 직접 매칭 실패 시 작물 공식 발생정보를 fallback 근거로 연결
  - 체크리스트에 `농사로 공식 발생정보 원문 확인` 항목 자동 추가
- `src/pages/Diagnosis.tsx`
  - 외관상 이상 소견 패널을 NCPMS 병해충 후보 결과와 분리해 표시
  - 병해충 후보가 연결되지 않은 경우 `NCPMS 병해충 후보와 명확히 연결되지 않음`으로 표시
  - 분석 후 농사로 근거자료를 후보별로 표시
  - 공식 자료 조회 상태 표시
  - 후보별 근거가 포함된 결과를 저장
- `src/services/diagnosisRecordService.ts`
  - `appearance_assessment`, `limitations`, `recommended_photos`, 후보별 `officialSources`, 체크리스트 저장
  - 사진 판독 완료 시 `diagnosis_records`에 별도 기록을 자동 생성하고, 이후 체크리스트 버튼은 같은 기록의 `checklist`만 업데이트

## 저장 구조

`diagnosis_records`에 다음 항목을 저장한다.

- `field_id`
- `crop_name`
- `body_part`
- `image_url`
- `image_name`
- `field_snapshot`
- `analysis_result`
- `confidence_band`
- `appearance_assessment`
  - `status`: `normal` | `abnormal` | `uncertain`
  - `confidenceBand`
  - `issueLabels`
  - `summary`
  - `visualReasons`
  - `recommendedActions`
- `candidates`
  - `name`
  - `confidenceBand`
  - `visualReasons`
  - `weatherReasons`
  - `nextChecks`
  - `officialSources`
- `checklist`
- `limitations`
- `recommended_photos`
- `expires_at`
  - 저장 시점 기준 30일 뒤로 설정
  - 만료된 기록은 조회에서 제외하고, Supabase `pg_cron` 정리 작업이 `delete_expired_diagnosis_records()`로 삭제

## 검증 결과

2026-05-06 기준 로컬 앱 `http://10.98.195.97:8080/diagnosis`에서 확인했다.

- 테스트 이미지: `tmp-fieldguard-diagnosis-test.png`
- 선택 필지/작물: `벼`
- 판독 결과:
  - 의심 후보 표시 성공
  - 후보별 `농사로 근거자료` 표시 성공
  - 우측 `농사로 공식 자료 비교` 정상 수집
  - 현장 체크리스트 생성 성공
  - 체크 후 `진단 기록 저장` 성공
- Supabase 최신 `diagnosis_records` 확인:
  - 후보: `깨씨무늬병`
  - 후보별 공식 근거: 2건
  - 체크리스트: `농사로 공식 발생정보 원문 확인` 완료 상태 저장
  - `limitations`, `recommended_photos` 저장 확인

## 한계

- 사진 판독은 확정 진단이 아니다. UI와 저장 데이터 모두 의심 후보와 현장 확인 권고로만 표현한다.
- 외관 스크리닝은 작물 공통 이상 소견이며 병명/해충명 확정이나 판매 가능 판정이 아니다.
- 농사로 병해충 발생정보 제목이 후보명과 직접 일치하지 않으면 작물 단위 최신 발생정보를 fallback 근거로 연결한다.
- Gemini가 계속 잘린 JSON 또는 비JSON을 반환하면 재시도 후 실패로 처리한다.

## 2026-05-09 판독 기록 재확인 보강

- 사진 판독 완료 시 `diagnosis_records`에 다음 값을 함께 저장한다.
  - `image_url`: 첫 번째 판독 이미지의 data URL. 큰 이미지는 720px 기준 JPEG preview로 축소해 저장한다.
  - `image_name`: 원본 파일명.
  - `field_snapshot`: 판독 당시 필지 ID, 필지명, 작물명, 주소 스냅샷.
  - `analysis_result`: Gemini/NCPMS 비교 후 생성된 전체 `DiagnosisResult` JSON과 최초 표시용 NCPMS 후보 참고 데이터.
- `/diagnosis` 화면에 `저장된 사진 판독 기록` 섹션을 추가했다.
  - 최근 30일 내 미만료 기록만 조회한다.
  - 판독 이미지, 판독 일시, 필지 정보, 작물/부위, 대표 후보, 외관 분석 요약, 체크리스트 완료 상태를 표시한다.
  - 저장된 판독 기록 항목을 클릭하면 최초 판독 완료 직후의 `사진 판독 결과` 카드와 같은 구성으로 외관 분석, NCPMS 후보 카드, NCPMS 이미지/제공 작업, 판독 제한/추가 촬영, 저장된 체크리스트를 펼쳐 확인할 수 있다.
  - 각 항목의 휴지통 버튼을 누르면 해당 `diagnosis_records.id` row를 삭제하고 목록을 다시 조회한다.
- 보존 기간은 기존 `expires_at` 기준 30일 유지 정책을 그대로 사용한다.
  - 조회는 `expires_at > now()` 조건으로 만료 기록을 제외한다.
  - Supabase `pg_cron` 작업은 `delete_expired_diagnosis_records()`를 호출해 만료 데이터를 삭제한다.
