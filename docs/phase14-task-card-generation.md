# Phase 14 Task Card Generation

## 목적

작업 카드 화면은 선택 필지의 날씨 위험, 병해충 위험, 농사로 농작업일정을 근거로 사용자가 바로 확인하거나 실행할 작업을 자동 생성한다. 농사로 주간농사정보 원문 목록만으로는 작업 카드를 만들지 않지만, 사용자가 PDF 요약을 요청해 `actionBullets`가 생성된 경우에는 `주간농사정보 기반 작업`으로 출처를 분리해 표시한다.

## 현재 API 매핑

| 화면/카드 근거 | 공식 API | 사용 오퍼레이션 | 기능 |
| --- | --- | --- | --- |
| 날씨 기반 작업 | 기상청_단기예보 조회서비스 | 초단기실황조회, 단기예보조회 | 강수, 습도, 풍속, 기온 기준으로 오늘 처리할 현장 점검 작업 생성 |
| 병해충 기반 작업 | NCPMS 병해충 검색 Open API 및 기존 병해충 위험 데이터 | 통합검색/상세정보 기반 위험 후보 | 병해충 위험 근거 확인, 현장 사진 기록, 공식 자료 확인 작업 생성 |
| 농작업일정 기반 자료 | 농사로 Open API - 농작업일정 | `workScheduleGrpList`, `workScheduleLst`, `workScheduleDtl`, `workScheduleEraInfoJsonLst`, 보조로 `workScheduleEraInfoLst` | 작물 그룹과 콘텐츠 번호를 찾고, 현재 한국 날짜 기준 이번 달에 걸치는 월/상중하 작업명(`opertNm`)을 하단 농작업일정 섹션에 표시 |
| 주간농사정보 브리핑 | 농사로 Open API - 주간농사정보 + Gemini API | `weekFarmInfoList`, `weekly-farm-briefing-proxy` | 최신 PDF를 Gemini 문서 처리로 읽고 선택 작물/작물군 관련 내용만 쉬운 말로 요약 |
| 주간농사정보 참고자료 | 농사로 Open API - 주간농사정보 + Supabase `weekly_farm_infos` | `weekFarmInfoList` | 제목의 적용 기간(`periodStart~periodEnd`)을 파싱해 현재 KST 주간 자료를 유지 표시 |
| AI 정리 레이어 | Gemini API | `gemini-proxy` 경유 | 공식 API 근거 카드의 문장 정리 보조. 기본 자동 작업 생성 근거로는 사용하지 않음 |

## 농작업일정 처리 방식

기존 구현은 `workScheduleLst`에서 찾은 일정 제목을 그대로 `농작업일정 확인: ...` 카드로 만들었다. 이 방식은 사용자가 실제로 무엇을 해야 하는지 바로 알기 어렵다.

현재 구현은 다음 순서로 처리한다.

1. `workScheduleGrpList`에서 선택 작물과 가장 가까운 작물 그룹을 찾는다. `복숭아`는 농사로 품목코드 `과수(210002)` 그룹으로 매핑한다.
2. `workScheduleLst`로 해당 그룹의 농작업일정 콘텐츠를 조회한다.
3. 콘텐츠 제목이 선택 작물명 또는 표준 작물명과 직접 매칭되는 항목만 남긴다. 예: 복숭아 필지에서 `과수` 그룹이 조회되더라도 `감귤`, `단감`, `사과` 일정은 제외한다.
4. `cntntsNo`별로 `workScheduleDtl`을 호출해 기본 상세를 보강한다.
5. 각 콘텐츠에 대해 `workScheduleEraInfoJsonLst`를 호출한다.
6. 응답의 `opertNm`, `farmWorkFlag`, `beginMon`, `beginEra`, `endMon`, `endEra`, `vodUrl` 등을 `eras` 배열로 정규화한다. `opertNm`에 포함된 `<br/>` 같은 HTML 조각은 저장·화면 표시 전에 텍스트 줄바꿈 또는 공백으로 정리한다.
7. 현재 한국 날짜부터 7일 동안 포함되는 월+상/중/하 시기를 구한다. 1~10일은 `상`, 11~20일은 `중`, 21일~월말은 `하`다.
8. 작업 카드 화면에서는 농작업일정 기반 자동 카드를 생성하지 않고, 하단 `이번 달 농작업일정` 섹션에 같은 달 범위와 겹치는 항목을 표시한다.
9. `workScheduleEraInfoJsonLst`의 구조화된 시기 정보가 없으면 해당 월의 농작업일정 행을 만들지 않는다.

조회 상태는 빈 배열 하나로 뭉개지 않는다. 화면은 `농작업일정 API 조회 실패`, `농작업일정 API 조회 성공 + 목록 매칭 실패`, `농작업일정 API 조회 성공 + 이번 주 매칭 결과 없음`, `농작업일정 API 조회 성공 + 이번 주 매칭 N건`을 구분해서 표시한다.

## 카드 생성 규칙

- 날씨 위험: 오늘 처리 작업으로 생성한다.
- 병해충 위험: 위험 점수가 1 이상이면 공식 근거 확인 작업으로 생성한다.
- 농작업일정: 엔진 기본값은 기존 호환을 위해 `includeWorkScheduleTasks`가 비어 있으면 실행 작업을 생성할 수 있다.
- 작업 화면 자동 생성: 중복을 막기 위해 `includeWorkScheduleTasks: false`로 호출해 `농작업일정 실행:*` 카드를 생성하지 않는다.
- 주간농사정보 원문 목록: 자동 작업 카드를 만들지 않는다. API가 본문 작업명 없이 `subject`, `regDt`, `downUrl`, `fileName` 중심으로 제공되기 때문이다.
- 주간농사정보 브리핑: 사용자가 요약 버튼을 눌러 PDF 본문에서 `actionBullets`가 생성된 경우에만 `주간농사정보 기반 작업 실행` 카드로 만든다.
- 완료된 같은 제목/날짜의 자동 생성 카드는 다시 생성하지 않는다.
- 기존 pending 자동 생성 카드 중 같은 계열의 카드가 있으면 새 근거 기준으로 교체한다.

## Gemini 적용 방향

Gemini는 독립적으로 작업 카드를 만들지 않는다. 공식 API와 규칙 기반 엔진이 먼저 만든 카드 초안을 입력으로 받고, 아래 범위만 수행한다.

- 제목을 더 짧고 실행 중심으로 정리
- 사유를 사용자 입장에서 이해하기 쉽게 정리
- 체크리스트를 1~5개로 압축
- 공식 API 근거에 없는 병명, 해충명, 농약명, 방제 지시는 추가하지 않음

구현 위치:

- `src/services/geminiTaskCardService.ts`
- `buildTaskCardRefinementPrompt`
- `parseTaskCardRefinementFromGeminiResponse`
- `refineTaskCardsWithGemini`

현재는 안전한 서비스 레이어와 JSON 파서까지 구현되어 있으며, 작업 카드 자동 생성 흐름에는 기본 활성화하지 않았다. 자동 적용은 비용, 응답 지연, 근거 왜곡 가능성을 보고 별도 플래그로 켜는 방식이 적절하다.

## 주간농사정보 PDF 브리핑

주간농사정보는 `weekFarmInfoList`에서 제목, 등록일, 파일 링크만 제공한다. 본문 작업명과 작물별 시기는 API 응답에 구조화되어 있지 않으므로 원문 목록만으로는 자동 작업 카드 생성에 쓰지 않는다.

단, 현재 주간 자료 판단에는 등록일(`regDt`)을 쓰지 않는다. `주간농사정보 제 19호 (2026.5.11.~5.17.)`처럼 제목의 괄호 안 날짜 범위를 파싱해 `periodStart=2026-05-11`, `periodEnd=2026-05-17`로 저장하고, 한국 시간 기준 오늘이 이 범위 안에 있을 때만 현재 주간 자료로 표시한다. 종료일에 연도가 생략된 경우 시작일의 연도를 사용한다.

대신 최신 자료의 `fileName` 또는 `downUrlList`에서 PDF 후보를 확인할 수 있을 때만 화면에 `요약` 버튼을 활성화한다. PDF가 아닌 HWPX/HTML 첨부만 있으면 프론트엔드가 `weekly-farm-briefing-proxy` 호출을 만들지 않고 원문 확인 안내를 표시한다. 사용자가 `요약` 버튼을 누른 경우에는 저장된 요약과 로컬 캐시를 건너뛰고 `weekly-farm-briefing-proxy`가 PDF를 서버에서 다시 다운로드해 Gemini 문서 처리 기능에 `application/pdf` inline data로 전달한다. 화면 재진입처럼 사용자가 직접 누르지 않은 로딩에서는 저장 요약을 먼저 재사용한다. 기본 PDF 요약 요청에는 raw KMA 기상값을 캐시 키나 프롬프트 입력으로 직접 넣지 않는다. 모델은 응답 지연을 줄이기 위해 `gemini-3-flash-preview`를 사용한다.

Supabase Edge Function의 약 30초 실행 제한을 넘기지 않기 위해 PDF 다운로드와 Gemini 호출은 각각 제한된 timeout 예산 안에서 처리한다. Gemini 호출은 26초까지 허용해 정상 생성 가능성을 높이되, 응답이 계속 지연되면 함수는 플랫폼 504까지 기다리지 않고 `status: "degraded"` 응답을 반환한다. Flash 모델은 사고 토큰을 함께 쓰므로 PDF 브리핑의 JSON 응답은 `maxOutputTokens: 3000`으로 둔다.

프론트엔드는 API 응답을 Supabase `weekly_farm_infos`에 upsert한다. 중복 기준은 정규화된 파일 URL이 있으면 `url:{downUrl}`, 없으면 `meta:{subject|regDt|fileName}`이다. 저장 필드는 `subject`, `writer_nm`, `reg_dt`, `period_start`, `period_end`, `down_url`, `down_url_list`, `file_name`, `summary_status`, `summary_text`, `summary_payload`, `created_at`, `updated_at`이다.

성공한 기본 브리핑은 같은 Supabase 행의 `summary_status=ready`, `summary_text`, `summary_payload`, `summary_model`, `summary_fetched_at`으로 저장한다. 기본 브리핑 키는 `sourceKey + periodStart + periodEnd + cropName`이고, 평상시 `weatherIncidentKey`는 `normal`이다. 최종 `contextKey`는 `baseBriefingKey + weatherIncidentKey` 구조의 JSON 문자열이다. 사용자가 `요약` 버튼을 누르기 전에는 Gemini를 호출하지 않는다. 화면 재진입 또는 새로고침 후에는 같은 PDF 기간과 작물의 기본 브리핑을 재사용한다.

날씨 변화는 `detectCriticalWeatherIncident()`에서 특이기상 사건으로 판정된 경우에만 브리핑 키에 반영한다. 현재 공통 기준은 `30mm 이상 강수`, `14m/s 이상 강풍`, `35℃ 이상 고온`, `0℃ 이하 저온`, `10mm 이상 강수 + 90% 이상 습도 + 20~30℃` 조합이다. 평상시 작은 기상값 변화는 `normal`로 유지해 PDF 전체 요약을 다시 생성하지 않는다. 특이기상 발생 시에는 `heavy_rain:2026-05-09:high` 같은 사건 키를 붙이고, 기존 PDF 요약에 위험 보정 bullet만 추가한다. 이 보정은 PDF 재요약이 아니라 현재 기상 위험을 화면과 작업 카드 생성에 반영하기 위한 별도 레이어다.

최신 요약 생성이 실패하면 같은 원문에 대한 이전 성공 요약을 `이전 요약` 상태로 표시하고, 캐시가 없으면 `요약 지연` 상태와 원문 PDF 링크를 표시한다. 이 상태의 브리핑은 `actionBullets`가 비어 있어 자동 작업 카드 생성 근거로 쓰이지 않는다.

브리핑 규칙:

- 선택 작물과 작물군에 직접 관련된 내용만 요약한다.
- 기본 PDF 요약은 선택 작물/작물군 중심으로 작성하고, 선택 필지와 KMA 기상 스냅샷은 화면 표시 및 특이기상 보정 레이어에서만 반영한다.
- Gemini는 먼저 선택 작물명과 정확히 일치하는 PDF 구간을 찾고, 없을 때만 작물군 구간을 찾는다.
- 한국어 작물군명은 PDF에서 `과 수`처럼 음절 사이 공백이 들어갈 수 있으므로 매칭 시 공백을 무시한다.
- 선택 작물명과 작물군 모두 PDF에서 확인되지 않으면 관련 없음으로 처리한다.
- Gemini 요청은 목표 작물/작물군 지시문을 먼저 보내고 PDF를 뒤에 첨부해 모델이 전체 문서를 무작위로 요약하지 않도록 한다.
- PDF 원문에 없는 농약명, 병명, 해충명, 방제 지시, 작업 지시는 추가하지 않는다. 기상 기반 문구는 병해충 확정이 아니라 가능성·확인 필요성으로만 표현한다.
- 응답은 `summaryBullets`, `weatherBullets`, `pestRiskBullets`, `irrigationBullets`, `growthManagementBullets`, `actionBullets`, `cautionBullets`, `evidenceSnippets` JSON으로 제한한다.
- 화면에서는 `이번 주 농사 브리핑`으로 표시하고, 필지명/주소/생육단계와 강수량·기온·풍속·습도 값을 함께 보여준다. 사용자가 `요약` 버튼을 누른 뒤 생성된 결과와 원문 PDF 링크를 함께 제공한다.
- 사용자가 직접 확인하기 전에는 작업 카드로 자동 전환하지 않는다.

## 주간농사정보 신규 감지

- 작업 화면은 `weekFarmInfoList`를 주기적으로 다시 호출하고 응답을 `weekly_farm_infos`에 upsert한다.
- 기존 `source_key`에 없던 새 행이면서 KST 오늘이 `period_start~period_end` 범위에 들어가면 화면 알림을 표시한다.
- 알림에는 `요약` 액션을 제공해 사용자가 즉시 PDF 브리핑 생성을 요청할 수 있다.
- 페이지 이동 또는 새로고침 후에도 화면은 Supabase에서 다시 읽은 현재 기간 자료를 표시한다.
- 원격 Supabase에 `weekly_farm_infos` migration이 적용되지 않으면 REST 404가 발생한다. 앱은 이 경우 API 결과를 임시 표시하지만 저장, 새 자료 중복 감지, 요약 영구 저장은 동작하지 않는다.

## UI 반영

- 작업 카드 상단에 근거 종류 배지 표시: `기상`, `병해충`, `농작업일정`, `주간농사정보`, `AI`
- 작업 카드 화면 상단의 `오늘/이번 주/완료` 탭은 제거하고, 완료 전 작업을 `해야 할 작업` 단일 목록으로 표시한다.
- 근거 데이터 펼침 영역에도 API 종류 배지를 표시
- 농작업일정 섹션은 `이번 달 농작업일정`으로 표시하고, 연간 전체 일정이나 상단 중복 작업 카드를 만들지 않는다.
- 농작업일정 섹션은 KST 현재 월에 걸치는 일정만 `생육과정`, `기상재해 및 예상 문제`, `병충해 방제` 등 API 분류별 행 목록으로 표시하며, 각 행에는 기간, 작업명, 현재 시기 배지, deterministic 확인할 일 목록을 표시한다.
- 주간농사정보는 `이번 주 농사 브리핑`의 버튼 기반 요약과 현재 KST 기간에 해당하는 제목, 적용 기간, 등록일, 파일 링크를 참고자료 영역에 표시

## 검증

필수 검증:

- `npm test`
- `npm run lint`
- `npm run build`
- `http://127.0.0.1:5173/tasks` 브라우저 확인: 콘솔 에러 없음. 선택 필지가 없을 때 안내 문구 정상 표시.

## 첨부 파일 다운로드

- 농사로 농작업일정 API는 첨부 링크를 `http://www.nongsaro.go.kr/portal/contentsFileDownload.do?...` 형태로 반환할 수 있다.
- 앱은 브라우저에 노출하기 전에 농사로 `www` 첨부 링크를 HTTPS로 정규화한다. 목적은 Chrome의 비보안 HTTP 다운로드 경고를 제거하는 것이다.
- 첨부 파일 형식은 농사로 원본 HWPX 그대로 유지한다. Microsoft Word가 복구 또는 읽을 수 없는 콘텐츠 경고를 표시할 수 있으며, 이는 HWPX 뷰어 호환성 문제이지 다운로드 바이트 손상의 증거가 아니다.
