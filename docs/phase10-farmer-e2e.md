# Phase 10 Farmer E2E Verification

검증 일시: 2026-05-06 KST

## Supabase 업로드 상태

- `npx supabase db push --dry-run`: 원격 DB 최신 상태 확인
- Edge Functions: `farmmap-proxy`, `kma-proxy`, `nongsaro-proxy`, `gemini-proxy` ACTIVE 확인

## 브라우저 E2E 결과

- 필지 등록
  - 좌표 등록: `Phase10 E2E 필지` 등록 후 대시보드 즉시 반영 확인
  - PNU 등록: `3611031024201550000` 단일 결과 조회 후 `Phase10 PNU 필지` 등록 확인
  - PNU 등록 저장값: 주소 `세종특별자치시 연기면 수산리`, 분류 `밭`, 면적 `3965.0481731㎡`, 좌표 `36.548410486532, 127.238118152201`
- 대시보드
  - 날씨 위험 정상 수집, 병해충 위험 예보/확인 권고, 공식 근거자료 표시 확인
  - 해야 할 작업 카드가 우선순위, 이유, 예상시간과 함께 표시됨
  - 타임라인에 날씨 위험, 병해충 위험, 사진 진단, 상담자료 생성 기록 저장 확인
- 작업 카드
  - 체크리스트 완료 전 완료 버튼 비활성 확인
  - 체크리스트 완료 후 해야 할 작업 목록에서 제외 확인
  - 근거 데이터 펼침에서 공식 자료 제목/URL 표시 확인
- 사진 판독
  - 사진 업로드, Gemini 의심 후보, 판독 제한 사유, 추가 촬영 안내 표시 확인
  - 농사로 병해충 발생정보 원문 링크 표시 확인
  - 현장 체크리스트 저장 후 `diagnosis_records` 및 `timeline_items` 저장 확인
- 농약 안전사용지침
  - 사진 판독 후보에서 `공식 안전사용지침 확인` 링크 이동 확인
  - 농사로 `agchmSafeManualList` 기반 공식 지침 문서 표시 확인
  - 수확 전 사용기간/사용횟수/희석배수는 현재 응답만으로 확정 불가 안내 표시 확인
- 상담자료
  - 상담 리포트 8개 섹션, 공식 자료 링크, 리포트 생성 기록 확인
  - 공유 링크는 HTTP/clipboard 미지원 환경에서 예외 없이 안내 처리
  - 인쇄/PDF 버튼은 `window.print` 호출 경로로 확인
- 모바일
  - 모바일 사이드바 열기, 메뉴 링크 이동, 닫힘 동작 확인
  - Radix `DialogTitle` 누락 오류 제거 확인

## 수정 사항

- `src/pages/Reports.tsx`
  - `navigator.clipboard` 미지원 환경에서 `공유 링크` 클릭 시 예외가 발생하지 않도록 방어 처리
- `src/components/ui/sidebar.tsx`
  - 모바일 Sheet에 접근성용 `SheetTitle`, `SheetDescription` 추가
- `src/components/AppSidebar.tsx`
  - 모바일 사이드바 메뉴 클릭 후 Sheet 닫힘 처리
- `src/context/SelectedFieldContext.tsx`
  - 선택 필지 ID를 로컬 저장소에 보존하고, 초기 로딩 중 빈 필드 배열로 선택값이 지워지지 않도록 수정

## 확인된 제한

- 농사로 프록시는 간헐적으로 504가 발생할 수 있으나, 재시도 후 정상 수집됨.
- 농약 상세 사용기간/사용횟수/희석배수는 현재 농사로 안전사용지침 문서 목록 API만으로 확정할 수 없음.
