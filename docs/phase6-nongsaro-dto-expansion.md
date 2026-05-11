# Phase 6 Nongsaro DTO Expansion

## 목표

- 농사로 XML 응답 DTO 매핑을 병해충/주간농사/농약안전사용지침까지 확장
- 대시보드/작업/리포트 화면에 공식 자료를 실제 연동

## 적용 파일

### 추가

- `src/domain/nongsaro/common.ts`
- `src/services/nongsaroPestService.ts`
- `src/services/nongsaroWeeklyService.ts`
- `src/services/nongsaroPesticideService.ts`

### 수정

- `src/services/nongsaroDisasterService.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Tasks.tsx`
- `src/pages/Reports.tsx`

## 구현 상세

### 1) 공통 유틸

- 상대 경로 형태 농사로 첨부 URL을 `https://www.nongsaro.go.kr/...` 절대경로로 정규화
- 연도 목록(`yearCode/yearVal`)에서 최신 연도 자동 선택

### 2) 병해충 발생정보 DTO

- 서비스: `dbyhsCccrrncInfoYear` + `dbyhsCccrrncInfoList`
- 매핑:
  - `cntntsNo -> sourceId`
  - `cntntsSj -> title`
  - `registDt/svcDtx/svcDt -> publishedAt`
  - `rtnOrginlFileNm -> attachmentName`
  - `downFile -> attachmentUrl`

### 3) 주간농사정보 DTO

- 서비스: `weekFarmInfoList`
- 작물명 검색 우선, 결과가 없으면 `주간농사` 키워드로 fallback
- 매핑:
  - `subject -> title`
  - `regDt -> publishedAt`
  - `writerNm -> writer`
  - `downUrl -> sourceUrl`
  - `fileName -> sourceFileName`

### 4) 농약안전사용지침 DTO

- 서비스: `agchmSafeManualList`
- 매핑:
  - `cntntsNo -> sourceId`
  - `cntntsSj -> title`
  - `prdlstCodeNm -> cropName`
  - `reformYm -> reformYm`
  - `nationCodeNm -> nationName`
  - `fileNm/fileUrl -> fileName/fileUrl`

## 화면 반영

### 대시보드

- `병해충 위험 후보` 카드 하단에 `공식 병해충 발생정보` 섹션 추가
- 최대 3건 제목/등록일/원문 링크 노출

### 작업 화면

- `이번 주` 탭에서 주간농사정보 실시간 노출
- 로딩/빈상태/원문 링크 표시

### 리포트 화면

- `공식 안전사용지침 확인` 카드 추가
- 선택 필지의 작물 기준 지침 목록 노출
- 기존 DB 기반 테이블은 보조 데이터로 유지

## 검증 결과

- `npm run lint`: 통과(기존 warning 8건 유지)
- `npx tsc --noEmit`: 통과

## 남은 작업

1. 농사로 농작업일정(`farmWorkingPlanNew`) DTO 연동
2. DB에 `source_status`, `collected_at`를 저장하는 동기화 job 구현
3. Edge Function 배포 후 실제 키 환경에서 E2E 검증
