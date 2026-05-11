# FieldGuard AI API 가이드 학습노트

작성일: 2026-05-05  
대상 자료 경로: `C:\Users\dbcdk\Desktop\제11회 ‘농업·농촌 공공데이터+AI’ 활용 창업경진대회\api가이드파일`

## 1. 학습 범위

이번 학습 범위는 사용자가 지정한 `api가이드파일` 폴더와 기존 팜맵 가이드 폴더이다.

`api가이드파일`에 포함된 자료:

| 구분 | 자료 |
|---|---|
| 기상청 | `기상청41_단기예보 조회서비스_오픈API활용가이드_241128.docx` |
| 기상청 | `기상청41_단기예보 조회서비스_오픈API활용가이드_격자_위경도(2510).xlsx` |
| 농사로 | `dbyhsCccrrncInfo` 병해충발생정보 |
| 농사로 | `weekFarmInfo` 주간농사정보 |
| 농사로 | `farmWorkingPlanNew` 농작업일정 |
| 농사로 | `agchmSafeManual` 농약안전사용지침 |
| 농사로 | `frcDsstrPrevnt` 농작물재해예방정보 |

주의:

- `api가이드파일` 안에는 팜맵 OpenAPI 가이드가 없다.
- 팜맵 가이드는 기존 `api_guides/farmmap_api` 경로의 PDF, XLSX, HTML 샘플을 함께 사용해야 한다.

## 2. 전체 구현 판단

FieldGuard AI에서 API는 프론트엔드 직접 호출보다 서버 래퍼를 통해 호출하는 구조가 맞다.

이유:

- 농사로와 기상청 인증키를 프론트에 노출하면 안 된다.
- 농사로는 XML 응답 중심이라 서버에서 파싱 후 UI용 JSON으로 변환하는 편이 안정적이다.
- 농사로 AJAX 방식은 신청 도메인 검증 오류 코드 `15`가 존재한다. REST 호출을 서버에서 처리하면 도메인 의존도를 줄일 수 있다.
- 기상청은 발표시각별 호출 가능 시간이 정해져 있어 서버에서 base_date/base_time 보정이 필요하다.
- Gemini API Key도 프론트 노출 금지다.

권장 아키텍처:

```text
React UI
→ 서버 API 라우트 또는 Supabase Edge Function
→ 공공 API 호출
→ XML/JSON 파싱
→ FieldGuard 표준 DTO 변환
→ React Query 캐시
→ 화면 표시
```

## 3. 기상청 단기예보 조회서비스

### 3.1 기본 정보

| 항목 | 값 |
|---|---|
| API명 | 단기예보 조회서비스(2.0) |
| 영문 API명 | `VilageFcstInfoService_2.0` |
| 기본 URL | `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0` |
| 제공 방식 | REST GET |
| 인증 | `serviceKey` |
| 응답 형식 | XML, JSON |
| FieldGuard 권장 응답 | `dataType=JSON` |
| 데이터 갱신 | 수시, 일 8회 기준 |

### 3.2 사용할 오퍼레이션

| 오퍼레이션 | 의미 | FieldGuard 활용 |
|---|---|---|
| `getUltraSrtNcst` | 초단기실황조회 | 현재 기온, 강수, 습도, 풍속 보정 |
| `getUltraSrtFcst` | 초단기예보조회 | 6시간 이내 강수·풍속·습도 변화 확인 |
| `getVilageFcst` | 단기예보조회 | 오늘/이번 주 위험도 계산의 주 입력 |
| `getFcstVersion` | 예보버전조회 | MVP에서는 보류. 캐시 무효화가 필요할 때 사용 |

### 3.3 공통 요청 파라미터

| 파라미터 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `serviceKey` | 필수 | 공공데이터포털 인증키 | URL Encode된 인증키 |
| `numOfRows` | 필수 | 한 페이지 결과 수 | `1000` |
| `pageNo` | 필수 | 페이지 번호 | `1` |
| `dataType` | 선택 | 응답 형식 | `JSON` |
| `base_date` | 필수 | 발표일자 | `20260505` |
| `base_time` | 필수 | 발표시각 | `0500` |
| `nx` | 필수 | 기상청 격자 X | `60` |
| `ny` | 필수 | 기상청 격자 Y | `127` |

### 3.4 발표시각 규칙

초단기실황:

- 매시간 정시에 생성된다.
- API는 매시 10분 이후 호출하는 것이 안전하다.
- 예: 06시 실황은 `base_time=0600`, 06:10 이후 호출.

초단기예보:

- 매시간 30분에 생성된다.
- API는 매시 45분 이후 호출하는 것이 안전하다.
- 예: 06시 30분 예보는 `base_time=0630`, 06:45 이후 호출.
- 각 발표시각마다 6시간 예보를 제공한다.

단기예보:

- 발표시각은 `0200`, `0500`, `0800`, `1100`, `1400`, `1700`, `2000`, `2300`.
- API 제공 시간은 각 발표시각 10분 이후로 본다.
- 예: `base_time=0500`은 05:10 이후 호출.
- 문서 기준 단기예보는 5일 연장 정보가 포함된다.

구현 규칙:

- 현재 시각보다 아직 제공되지 않은 `base_time`을 선택하면 오류 또는 빈 데이터 가능성이 있다.
- 서버에서 `현재 KST 시각` 기준으로 가장 최근 제공 완료된 발표시각을 계산해야 한다.

### 3.5 응답 필드

초단기실황 응답 주요 필드:

| 필드 | 설명 |
|---|---|
| `baseDate` | 발표일자 |
| `baseTime` | 발표시각 |
| `category` | 자료구분코드 |
| `obsrValue` | 실황값 |
| `nx`, `ny` | 격자 좌표 |

초단기예보/단기예보 응답 주요 필드:

| 필드 | 설명 |
|---|---|
| `baseDate` | 발표일자 |
| `baseTime` | 발표시각 |
| `fcstDate` | 예보일자 |
| `fcstTime` | 예보시각 |
| `category` | 자료구분코드 |
| `fcstValue` | 예보값 |
| `nx`, `ny` | 격자 좌표 |

### 3.6 FieldGuard에서 사용할 기상 코드

| 코드 | 의미 | 단위/값 | 위험도 활용 |
|---|---|---|---|
| `T1H` | 기온 | 도 | 초단기 현재/예보 기온 |
| `TMP` | 1시간 기온 | 도 | 고온·저온 위험 |
| `TMN` | 일 최저기온 | 도 | 저온 위험 |
| `TMX` | 일 최고기온 | 도 | 고온 위험 |
| `RN1` | 1시간 강수량 | mm 또는 범주 | 강수·배수 위험 |
| `PCP` | 1시간 강수량 | 범주/문자열 | 강수·배수 위험 |
| `REH` | 습도 | % | 병해충 위험 상승 조건 |
| `WSD` | 풍속 | m/s | 강풍 위험 |
| `PTY` | 강수형태 | 코드값 | 비/눈/소나기 구분 |
| `SKY` | 하늘상태 | 코드값 | 작업 가능성 보조 |
| `POP` | 강수확률 | % | 작업 지연 위험 |

### 3.7 기상 코드값 해석

하늘상태 `SKY`:

| 값 | 의미 |
|---:|---|
| 1 | 맑음 |
| 3 | 구름많음 |
| 4 | 흐림 |

강수형태 `PTY`:

| 값 | 초단기 | 단기 |
|---:|---|---|
| 0 | 없음 | 없음 |
| 1 | 비 | 비 |
| 2 | 비/눈 | 비/눈 |
| 3 | 눈 | 눈 |
| 4 | 없음 | 소나기 |
| 5 | 빗방울 | 없음 |
| 6 | 빗방울눈날림 | 없음 |
| 7 | 눈날림 | 없음 |

강수량 `RN1`, `PCP`:

- `-`, `null`, `0`은 강수없음으로 처리한다.
- `1mm 미만`, `30.0~50.0mm`, `50.0mm 이상`처럼 문자열 범주가 올 수 있다.
- 위험도 계산에서는 문자열을 수치 구간으로 변환해야 한다.

풍속 정성정보:

| 값 | 의미 |
|---:|---|
| 1 | 약한 바람. 4m/s 이상 |
| 2 | 약간 강한 바람. 4m/s 이상 9m/s 미만 |
| 3 | 강한 바람. 9m/s 이상 |

Missing 값:

- `+900` 이상, `-900` 이하는 Missing 값으로 처리한다.
- 해상 마스킹 지역은 기온, 강수확률, 강수량/적설, 습도가 Missing 처리될 수 있다.

### 3.8 격자 위경도 엑셀

파일: `기상청41_단기예보 조회서비스_오픈API활용가이드_격자_위경도(2510).xlsx`

시트:

- `최종 업데이트 파일_20251027`

주요 컬럼:

| 컬럼 | 의미 |
|---|---|
| `행정구역코드` | 행정구역 코드 |
| `1단계` | 시도 |
| `2단계` | 시군구 |
| `3단계` | 읍면동 |
| `격자 X` | 기상청 `nx` |
| `격자 Y` | 기상청 `ny` |
| `경도(시/분/초)` | 경도 |
| `위도(시/분/초)` | 위도 |

구현 판단:

- 필지 좌표가 있으면 위경도→기상청 격자 변환 함수를 우선 사용한다.
- 주소 기반 fallback 또는 검증용으로 엑셀의 행정구역별 격자표를 활용한다.
- 엑셀 파일을 런타임에서 직접 읽기보다 개발 시 JSON/CSV로 변환해 정적 자원 또는 DB seed로 관리하는 편이 맞다.

## 4. 농사로 공통 규칙

### 4.1 기본 호출 구조

농사로 REST 공통 형식:

```text
http://api.nongsaro.go.kr/service/{serviceName}/{operationName}?apiKey={NONGSARO_API_KEY}
```

공통 특징:

- REST GET 또는 AJAX 방식 제공.
- 문서와 샘플은 XML 응답 기준이다.
- 텍스트 인코딩은 UTF-8이다.
- 한글 검색어는 URL Encoding 후 전송해야 한다.
- `response/header/resultCode`, `resultMsg`를 먼저 검사해야 한다.

### 4.2 결과 코드

| 코드 | 의미 | 처리 |
|---|---|---|
| `00` | 정상 처리. 검색 결과 없음도 포함 가능 | 정상 응답으로 처리하되 item 0건 여부 별도 확인 |
| `11` | 인증키 누락 또는 미발급 인증키 | API Key 설정 오류 |
| `12` | 발급 키가 관리자에 의해 일시 중지 | 운영자 확인 필요 |
| `13` | 제공하지 않는 서비스 또는 오퍼레이션 | serviceName/operationName 오타 확인 |
| `15` | AJAX 방식에서 신청 도메인 외 호출 | 서버 REST 호출로 회피하거나 도메인 재신청 |
| `91` | 농사로 Open API 시스템 오류 | 재시도 또는 장애 안내 |

### 4.3 서버 파싱 원칙

농사로 응답은 아래 순서로 처리한다.

1. XML 문자열 수신
2. `resultCode` 확인
3. `item` 목록 추출
4. 필드별 CDATA 제거
5. 프로젝트 표준 DTO로 변환
6. `totalCount`, `numOfRows`, `pageNo`가 있으면 페이지 정보 저장

## 5. 농사로 병해충발생정보

### 5.1 기본 정보

| 항목 | 값 |
|---|---|
| 서비스명 | `dbyhsCccrrncInfo` |
| 제공방식 | REST, AJAX |
| FieldGuard 용도 | 작물별 병해충 위험 후보 생성, 공식 발생정보 근거 연결 |

### 5.2 오퍼레이션

| operationName | 설명 | 주요 파라미터 |
|---|---|---|
| `dbyhsCccrrncInfoYear` | 병해충발생정보 연도 콤보 | `apiKey` |
| `dbyhsCccrrncInfoList` | 병해충발생정보 리스트 | `apiKey`, `sYear`, `sType`, `sText`, `pageNo` |

`sType` 값:

| 값 | 의미 |
|---|---|
| `sCntntsSj` | 제목 검색 |
| `sWriteNm` | 작성자 검색 |

### 5.3 응답 필드

`dbyhsCccrrncInfoYear`:

| 필드 | 의미 |
|---|---|
| `yearCode` | 년도명 |
| `yearVal` | 년도값 |
| `yearCnt` | 연도 카운트 |

`dbyhsCccrrncInfoList`:

| 필드 | 의미 |
|---|---|
| `cntntsNo` | 컨텐츠 번호 |
| `pblicteYear` | 년도 |
| `cntntsSj` | 컨텐츠 제목 |
| `cntntsChargerEsntlNm` | 담당자명 |
| `registDt` | 등록일시 |
| `cntntsRdcnt` | 조회수 |
| `rtnOrginlFileNm` | 파일명 |
| `downFile` | 파일경로 |
| `svcDtx` | 등록일시 |
| `svcDt` | 등록일 |
| `updusrEsntlNm` | 등록자 |

### 5.4 FieldGuard 매핑

| 농사로 필드 | FieldGuard 필드 |
|---|---|
| `cntntsNo` | `sourceId` |
| `cntntsSj` | `title` |
| `registDt` 또는 `svcDt` | `publishedAt` |
| `downFile` | `attachmentUrl` |
| `rtnOrginlFileNm` | `attachmentName` |

검색 전략:

- 작물명으로 `sType=sCntntsSj`, `sText={cropName}` 검색.
- 결과 제목에서 작물명, 병해충명, 시기 키워드를 재필터링한다.
- 병해충 확정 진단 근거로 사용하지 않고 `공식 발생정보 참고자료`로만 표시한다.

## 6. 농사로 주간농사정보

### 6.1 기본 정보

| 항목 | 값 |
|---|---|
| 서비스명 | `weekFarmInfo` |
| 제공방식 | REST, AJAX |
| FieldGuard 용도 | 오늘/이번 주 작업 카드 근거, 첨부자료 연결 |

### 6.2 오퍼레이션

| operationName | 설명 | 주요 파라미터 |
|---|---|---|
| `weekFarmInfoList` | 주간농사정보 목록 | `apiKey`, `subject`, `pageNo`, `numOfRows` |

### 6.3 응답 필드

| 필드 | 의미 |
|---|---|
| `subject` | 제목 |
| `writerNm` | 작성자 |
| `regDt` | 등록일 |
| `hitCt` | 조회수 |
| `downUrl` | 파일다운로드 URL |
| `downUrlList` | 파일다운로드 URL 전체목록 |
| `fileName` | 파일명 |

### 6.4 FieldGuard 매핑

| 농사로 필드 | FieldGuard 필드 |
|---|---|
| `subject` | `sourceTitle` |
| `regDt` | `publishedAt` |
| `downUrl` | `sourceUrl` |
| `fileName` | `sourceFileName` |

검색 전략:

- `subject={cropName}` 또는 `subject=주간농사` 검색.
- 최신 등록일 우선.
- 첨부파일을 직접 분석할 경우 별도 다운로드 파이프라인이 필요하다.

## 7. 농사로 농작업일정

### 7.1 기본 정보

| 항목 | 값 |
|---|---|
| 서비스명 | `farmWorkingPlanNew` |
| 제공방식 | REST GET |
| FieldGuard 용도 | 작물별 생육시기·작업 일정 기반 작업 카드 생성 |

### 7.2 오퍼레이션

샘플과 매뉴얼에서 확실히 확인된 오퍼레이션:

| operationName | 설명 | 주요 파라미터 |
|---|---|---|
| `workScheduleGrpList` | 품목코드 정보 조회 | `apiKey` |
| `workScheduleLst` | 농작업일정 목록 정보 조회 | `apiKey`, `kidofcomdtySeCode` |
| `workScheduleEraInfoLst` | 농작업일정 시기 상세 정보 조회 | `apiKey`, `cntntsNo` |
| `workScheduleDtl` | 농작업일정 기본 상세 정보 조회 | `apiKey`, `cntntsNo` |

매뉴얼에는 `농작업일정 시기 상세 정보 JSON 조회`도 언급되지만, 동봉 샘플에서 확인된 구현 대상은 위 4개다. JSON 오퍼레이션의 정확한 이름은 매뉴얼 텍스트 추출만으로 확정하지 않는다.

### 7.3 응답 필드

`workScheduleGrpList`:

| 필드 | 의미 |
|---|---|
| `codeNm` | 품목명 |
| `kidofcomdtySeCode` | 품목 코드 |
| `sort` | 순서 |

`workScheduleLst`:

| 필드 | 의미 |
|---|---|
| `cntntsNo` | 컨텐츠 번호 |
| `fileDownUrlInfo` | 파일 다운로드 URL |
| `fileSeCode` | 파일 구분 코드 |
| `orginlFileNm` | 원본 파일명 |
| `sj` | 제목 |

`workScheduleEraInfoLst`:

| 필드 | 의미 |
|---|---|
| `htmlCn` | 시기별 작업 일정 HTML |

`workScheduleDtl`:

| 필드 | 의미 |
|---|---|
| `cn` | 기본 상세 내용 HTML |

### 7.4 FieldGuard 호출 순서

```text
1. workScheduleGrpList 호출
2. cropName과 codeNm을 매칭해 kidofcomdtySeCode 확보
3. workScheduleLst 호출
4. 사용 가능한 cntntsNo 확보
5. workScheduleEraInfoLst 호출
6. htmlCn에서 월/시기/작업 항목 추출
7. 필요 시 workScheduleDtl 호출
8. cn에서 상세 설명 추출
9. 오늘 날짜와 작물 조건에 맞는 작업 카드 생성
```

주의:

- `htmlCn`, `cn`은 HTML 문자열이다.
- 화면에 직접 삽입하지 말고 sanitize 후 표시하거나 서버에서 텍스트/구조 데이터로 변환한다.
- `kidofcomdtySeCode`는 작물명 직접 입력값과 정확히 매칭되지 않을 수 있으므로 유사어 매핑 테이블이 필요하다.

## 8. 농사로 농약안전사용지침

### 8.1 기본 정보

| 항목 | 값 |
|---|---|
| 서비스명 | `agchmSafeManual` |
| 제공방식 | REST GET |
| FieldGuard 용도 | 작물·병해충 관련 공식 농약안전사용지침 확인 |

### 8.2 오퍼레이션

| operationName | 설명 | 주요 파라미터 |
|---|---|---|
| `nationList` | 국가 목록/검색조건 조회 | `apiKey` |
| `agchmSafeManualList` | 농약안전사용지침 목록 | `apiKey`, `sCntntsSj`, `sPrdlstCodeNm`, `sReformYear`, `sNationVal`, `pageNo` |

검색 파라미터:

| 파라미터 | 의미 |
|---|---|
| `sCntntsSj` | 지침명 |
| `sPrdlstCodeNm` | 작목명 |
| `sReformYear` | 개정년도 |
| `sNationVal` | 국가 코드 목록 |
| `pageNo` | 페이지 번호 |

### 8.3 응답 필드

`nationList`:

| 필드 | 의미 |
|---|---|
| `code` | 국가 코드 |
| `codeNm` | 국가명 |

`agchmSafeManualList`:

| 필드 | 의미 |
|---|---|
| `cntntsNo` | 컨텐츠 번호 |
| `cntntsSj` | 지침명 |
| `fileNm` | 첨부파일명 |
| `fileUrl` | 첨부파일 URL |
| `nationCode` | 국가 코드 |
| `nationCodeNm` | 국가명 |
| `prdlstCode` | 작목 코드 |
| `prdlstCodeNm` | 작목명 |
| `reformYm` | 개정년월 |

### 8.4 FieldGuard 정책

- 이 API는 농약 처방이 아니라 공식 자료 확인 기능이다.
- UI 문구는 `공식 안전사용지침 확인`으로 제한한다.
- 농약명 추천, 사용량 추천, 살포 지시 문구 생성 금지.
- 결과가 없으면 `해당 조건의 공식 지침이 확인되지 않습니다.`로 표시한다.

## 9. 농사로 농작물재해예방정보

### 9.1 기본 정보

| 항목 | 값 |
|---|---|
| 서비스명 | `frcDsstrPrevnt` |
| 제공방식 | 매뉴얼 기준 AJAX, URL은 농사로 service 경로 |
| FieldGuard 용도 | 호우, 고온, 저온, 강풍 등 재해 예방 체크리스트 근거 |

### 9.2 오퍼레이션

매뉴얼에서 확인된 오퍼레이션:

| operationName | 설명 | 주요 파라미터 |
|---|---|---|
| `frcDsstrPrevntYear` | 검색년도 목록 | `apiKey`, `sType`, `sText` |
| `frcDsstrPrevntLst` | 농작물재해예방정보 목록 | `apiKey`, `sYear`, `sText`, `sType`, `pageNo`, `numOfRows` |

중요:

- 샘플 HTML에는 `frcDsstrPrevntYear`만 직접 보인다.
- 실제 목록 조회는 매뉴얼에 `frcDsstrPrevntLst`로 명시되어 있다.
- 기존 기획 문서에 `frcDsstrPrevntYear`만 적혀 있으면 목록 조회가 불가능하므로 `frcDsstrPrevntLst`를 반드시 포함해야 한다.

### 9.3 응답 필드

`frcDsstrPrevntYear`:

| 필드 | 의미 |
|---|---|
| `yearCode` | 년도코드 |

`frcDsstrPrevntLst`:

| 필드 | 의미 |
|---|---|
| `cntntsNo` | 콘텐츠 번호 |
| `cntntsSj` | 제목 |
| `cntntsRdcnt` | 조회수 |
| `rtnFileSeCode` | 파일구분코드 |
| `rtnFileSn` | 파일순번 |
| `rtnOrginlFileNm` | 원본 파일명 |
| `rtnStreFileNm` | 저장 파일명 |
| `rtnFileCours` | 파일경로 |
| `rtnImageDc` | 이미지 설명 |
| `rtnThumbFileNm` | 썸네일 파일명 |
| `svcDtx` | 등록일시, YYYY-MM-DD |
| `svcDt` | 등록일시, DATE |
| `noticeAt` | 공지 여부 |
| `updusrEsntlNm` | 작성자명 |

### 9.4 FieldGuard 매핑

| 농사로 필드 | FieldGuard 필드 |
|---|---|
| `cntntsNo` | `sourceId` |
| `cntntsSj` | `title` |
| `svcDtx` 또는 `svcDt` | `publishedAt` |
| `rtnOrginlFileNm` | `attachmentName` |
| `rtnFileCours` | `attachmentPath` |
| `rtnThumbFileNm` | `thumbnailName` |

검색 전략:

- 호우, 폭염, 한파, 강풍, 태풍, 침수, 가뭄 등의 키워드로 조회한다.
- 기상청 위험 항목과 연결해 체크리스트 근거로 사용한다.

## 10. 팜맵 OpenAPI

`api가이드파일`에는 없지만 기존 `api_guides/farmmap_api`에서 확인된 구현 대상이다.

### 10.1 기본 정보

| 항목 | 값 |
|---|---|
| 신청/가이드 | 농식품 팜맵 서비스 |
| 인증 | `apiKey` + `domain` |
| FieldGuard 용도 | 필지 위치, 면적, 농경지 정보 확인 |

### 10.2 확인된 주요 기능

| 기능 | 목적 |
|---|---|
| `farmapApi.do` | 팜맵 지도 API 객체 로드 |
| `farmmapApi/getFarmmapDataSeachPnu.do` | PNU 기준 필지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachXY.do` | 좌표 기준 필지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachRadius.do` | 반경 내 주변 농경지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachAnalysisBasePnu.do` | PNU 기준 분석용 농경지 정보 조회 |

주의:

- 팜맵 샘플의 `Seach` 철자는 문서/샘플 그대로 사용해야 한다.
- API Key 발급 도메인과 실제 호출 도메인이 다르면 실패할 수 있다.
- 개발용 키와 배포용 키를 분리한다.

## 11. FieldGuard 표준 API 클라이언트 설계

### 11.1 환경 변수

```env
FARMMAP_API_KEY=
FARMMAP_DOMAIN=
KMA_SERVICE_KEY=
NONGSARO_API_KEY=
GEMINI_API_KEY=
```

### 11.2 내부 서비스 파일 권장

```text
src/services/
  farmmapClient.ts
  kmaClient.ts
  nongsaroClient.ts
  geminiClient.ts

src/domain/
  weather/
    kmaGrid.ts
    weatherRisk.ts
  nongsaro/
    pestOccurrence.ts
    weeklyFarmInfo.ts
    farmWorkingPlan.ts
    pesticideSafeManual.ts
    disasterPrevention.ts
```

### 11.3 데이터 변환 규칙

기상청:

- `items.item[]`을 시간축 기준으로 그룹화한다.
- `category`별 값을 객체로 피벗한다.
- 강수량 문자열 범주는 숫자 구간으로 변환한다.
- Missing 값은 `null`로 변환한다.

농사로:

- XML 응답을 파싱한다.
- `resultCode !== "00"`이면 표준 오류로 변환한다.
- `item`이 없으면 정상 빈 결과로 처리한다.
- HTML 필드는 sanitize 또는 서버 측 텍스트 추출 후 사용한다.

### 11.4 캐시 기준

| 데이터 | 권장 캐시 |
|---|---:|
| 기상청 초단기실황 | 30분 |
| 기상청 초단기예보 | 30분 |
| 기상청 단기예보 | 3시간 |
| 농사로 병해충발생정보 | 1일 |
| 농사로 주간농사정보 | 1일 |
| 농사로 농작업일정 품목코드 | 7일 |
| 농사로 농작업일정 상세 | 7일 |
| 농사로 농약안전사용지침 | 7일 |
| 농사로 농작물재해예방정보 | 1일 |
| 팜맵 필지 정보 | 등록 시 저장, 수동 갱신 |

## 12. 구현 전 확정해야 할 사항

1. 팜맵 개발용 도메인: `http://localhost:3000` 또는 실제 배포 URL 중 하나.
2. 농사로 REST 호출이 운영 환경에서 HTTP만 허용되는지, HTTPS도 가능한지 확인 필요. 현재 로컬 가이드 기준은 HTTP다.
3. 농사로 `frcDsstrPrevnt`는 매뉴얼상 AJAX 제공이라고 적혀 있으나 URL은 service 경로를 제공한다. 실제 인증키 발급 후 REST 직접 호출 가능 여부 확인 필요.
4. 농작업일정 JSON 상세 오퍼레이션은 매뉴얼에 언급되지만 샘플에서 정확한 operationName이 확인되지 않았다. MVP에서는 샘플 확인된 `workScheduleEraInfoLst`, `workScheduleDtl`만 사용한다.
5. 기상청 격자 변환은 공식을 구현하되, 엑셀 격자표를 검증/보조 데이터로 사용한다.

