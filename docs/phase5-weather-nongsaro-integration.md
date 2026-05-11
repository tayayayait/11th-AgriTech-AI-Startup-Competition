# Phase 5 Weather + Nongsaro Integration

## 목표

- 기상청 단기예보 `base_date/base_time` 자동 보정 로직 구현
- 위경도 → 기상청 격자 변환 구현
- 대시보드에 실시간 기상 연동 + 실패 시 DB fallback 표시
- 농사로 XML 공통 파서 구현
- 농사로 `frcDsstrPrevntYear` / `frcDsstrPrevntLst` 연동

## 적용 파일

### 추가

- `src/domain/weather/kma.ts`
- `src/domain/weather/weatherRisk.ts`
- `src/services/weatherLiveService.ts`
- `src/domain/nongsaro/xml.ts`
- `src/services/nongsaroDisasterService.ts`

### 수정

- `src/pages/Dashboard.tsx`
- `src/pages/Reports.tsx`

## 구현 상세

### 1) 기상청 보정 로직

- `ultraSrtNcst`: 정시 발표 + 10분 이후 사용
- `ultraSrtFcst`: `HH30` 발표 + 45분 이후 사용
- `vilageFcst`: `0200,0500,0800,1100,1400,1700,2000,2300` + 10분 이후 사용
- 제공 시각 이전이면 직전 발표 시각으로 자동 내림

### 2) 기상청 격자 변환

- DFS(LCC) 상수 기반 위경도→격자(`nx`,`ny`) 변환 함수 추가
- 대시보드 실시간 조회 시 필지 좌표를 격자로 변환해 호출

### 3) 대시보드 실시간/대체 표시

- 실시간 소스 상태 배지:
  - `connected` → 정상 수집
  - `delayed` → 응답 지연
  - `rate_limited` → 요청 한도 초과
  - `unavailable` → 공식 데이터 조회 불가
- 실시간 실패 시 `weather_risks` DB 최신값으로 fallback
- 수집 시각이 3시간 초과 시 `정보 갱신 필요` 배지 노출
- 실시간 KMA 조회 성공 시 `weather_risks`에 최신 수집값 저장
- 같은 산식으로 `fields.risk_score`, `fields.risk_level`을 갱신해 오늘 위험도와 날씨 데이터 상태 불일치를 제거

### 3-1) 날씨 위험도 산식

- 강수:
  - `80mm+` 90점, `50mm+` 80점, `30mm+` 70점, `20mm+` 55점, `0mm 초과` 25점
- 고온:
  - `38도+` 90점, `35도+` 75점, `33도+` 55점
- 저온:
  - `-10도 이하` 90점, `-5도 이하` 75점, `0도 이하` 55점
- 강풍:
  - `14m/s+` 90점, `9m/s+` 70점, `6m/s+` 45점
- 습도:
  - `95%+` 75점, `85%+` 55점, `80%+` 40점
- 종합 점수:
  - 가장 높은 단일 요인 점수 + 나머지 요인 점수의 25%, 최대 100점
  - `scoreToLevel` 공통 임계값으로 `low/watch/high/critical` 변환

### 4) 농사로 XML 파서

- `resultCode`, `resultMsg` 검사
- `item` 배열 추출
- 코드별 표준 오류 메시지 변환(11/12/13/15/91)

### 5) 농사로 재해예방 자료 연동

- `frcDsstrPrevntYear` 조회 후 최신 연도 계산
- `frcDsstrPrevntLst`에서 최대 5건 추출
- 리포트 화면에 공식 재해예방 자료 카드로 노출

## 검증 결과

- `npm run lint`: 통과(기존 경고 8건 유지)
- `npx tsc --noEmit`: 통과
- `npm test`: 통과
- `npm run api:smoke`: 통과
- `npm run build`: 통과
- 브라우저 `http://10.98.195.97:8080/dashboard`: 실시간 KMA 정상 수집, 오늘 위험도/필지 배지 `낮음`, `weather_risks` 저장 확인

## 남은 작업

1. 농사로 XML 필드별 DTO 매핑 확장(병해충/주간농사/농약안전사용지침)
2. Supabase Edge Function 실배포 + Secret 설정 후 E2E 검증
