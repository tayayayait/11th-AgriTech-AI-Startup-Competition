# Phase 7 Photo Diagnosis

## 목표

- 사진 판독 화면(`/diagnosis`) 복구 및 상세서 Phase 7 요구사항 반영
- 업로드 검증/진행률/분석 취소/재시도/파일 교체 상태 흐름 구현
- Gemini 판독 결과 + 농사로 공식 자료 비교 + 체크리스트 저장까지 연결

## 적용 파일

### 추가

- `src/pages/Diagnosis.tsx`

### 수정

- `src/pages/Reports.tsx`
- `src/services/diagnosisRecordService.ts`

## 구현 상세

### 1) 사진 판독 상태 머신 UI

- 상태: `ready | uploading | analyzing | needs_more_photo | completed | limited | failed`
- `uploading`: 파일 base64 변환 단계 진행률 표시
- `analyzing`: 로더 + `분석 취소` 버튼
- `failed`: `다시 시도` + `파일 교체` 버튼 제공
- `needs_more_photo`: 추가 촬영 안내 우선 노출
- `limited`: 판독 제한 사유 배너 노출

### 2) 업로드 규칙 및 오류 처리

- 형식 제한: JPG/PNG/WEBP
- 크기 제한: 장당 10MB
- 수량 제한: 1회 5장
- 권장 해상도(짧은 변 1024px) 미달 시 경고 표시
- 손상 파일은 읽기 실패 메시지로 처리
- 유효하지 않은 파일 선택 시 기존 선택 파일은 유지

### 3) AI 분석 및 중단 제어

- `AbortController` 기반 분석 취소 지원
- 분석 실패 시 기존 사진 유지 후 재시도 가능
- 의심 후보 최대 3개, 근거/제한사항/추가촬영 안내 렌더링

### 4) 공식 자료 비교 및 저장

- 후보명 목록 기반 `getPestOccurrenceSourcesByCandidates` 조회
- 조회 상태 배지(`connected/delayed/unavailable/rate_limited`) 표시
- `saveDiagnosisRecord`로 체크리스트/후보/신뢰구간 저장
- 저장 후 기록 ID 표시 및 리포트 화면 이동 링크 제공

### 5) 리포트 탭 연동

- `/reports?tab=pesticide` 쿼리 파라미터로 농약 안전사용지침 탭 직행 지원
- 사진 판독 후보 카드에서 `공식 안전사용지침 확인` 링크 제공

## 검증 결과

- `npm run lint`: 통과 (기존 warning 8건 유지)
- `npx tsc --noEmit`: 통과
- `npm test`: 통과
- `npm run build`: 실패 (기존 동일 환경 오류, `exit -1073740791`)

## 남은 작업

1. 진단 기록을 리포트 섹션(사진 기록/체크리스트)에 실제 조회 데이터로 반영
2. 진단 결과의 `status/limitations/recommended_photos` 컬럼 저장 확장
3. 빌드 크래시 원인(Node 프로세스 비정상 종료) 별도 디버깅
