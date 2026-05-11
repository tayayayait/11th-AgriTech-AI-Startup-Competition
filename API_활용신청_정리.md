# FieldGuard AI API 활용신청 정리

작성일: 2026-05-05  
목적: FieldGuard AI 구현에 필요한 API 활용신청 및 인증키 발급 대상 정리

## 1. 신청 우선순위

| 우선순위 | API | 신청 필요성 | 용도 |
|---:|---|---|---|
| 1 | 팜맵 OpenAPI | 필수 | 필지 위치, 면적, 농경지 정보 확인 |
| 2 | 기상청 단기예보 조회서비스 | 필수 | 필지 위치 기준 강수, 기온, 풍속 등 위험 분석 |
| 3 | 농사로 OpenAPI | 필수 | 병해충, 농작업, 농약안전사용지침, 재해예방 정보 조회 |
| 4 | Gemini API | 필수 | 사진 기반 병해충 의심 판독, 작업 카드/체크리스트 생성 |
| 5 | 지도 배경 API | 선택 | 팜맵 지도 표시 보조. 팜맵 지도 API만으로 충분하면 보류 |

## 2. 신청서 공통 활용 목적 문구

아래 문구를 API 활용신청의 `활용 목적`, `서비스 설명`, `활용 내용`에 사용할 수 있다.

```text
FieldGuard AI는 농민이 등록한 필지 위치와 재배 작물 정보를 기준으로 공공데이터와 AI를 결합하여 오늘의 병해충·기상재해 위험도, 작업 우선순위, 현장 확인 체크리스트를 제공하는 농민용 Web App 서비스입니다.

팜맵 데이터는 필지 위치·면적·농경지 정보 확인에 사용하고, 기상청 단기예보는 필지 위치 기준 강수·기온·풍속 등 기상 위험 분석에 사용합니다. 농사로 데이터는 병해충 발생정보, 주간농사정보, 농작업 일정, 농약안전사용지침, 농작물재해예방정보 조회에 사용합니다. Gemini API는 사용자가 업로드한 병징 사진 분석과 공공데이터 기반 작업 카드·체크리스트 생성에 사용합니다.

본 서비스는 병해충 확정 진단이나 농약 처방 목적이 아니라, 공식 공공데이터 접근성을 높이고 농민의 현장 의사결정을 보조하는 위험 예측 서비스입니다.
```

## 3. 필수 API 상세

### 3.1 팜맵 OpenAPI

| 항목 | 내용 |
|---|---|
| 신청처 | 농식품 팜맵 서비스 |
| 공식 URL | https://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=3 |
| 인증 방식 | 팜맵 API Key + 등록 도메인 |
| 신청 전제 | 회원가입, 팜맵 인증KEY 발급 |
| 프로젝트 내 용도 | 필지 등록, 필지 면적 확인, 필지 지도, 필지 기반 위험 매핑 |
| 신청 우선순위 | 필수 |

공식 페이지 기준 확인 사항:

- 팜맵 OpenAPI는 농경지 정보를 API로 제공하는 서비스이다.
- 지도 API와 데이터 API를 제공한다.
- 서비스 이용 전 회원가입 및 팜맵 인증KEY 발급이 필요하다.
- API Key 발급 신청 시 활용분야, 활용유형, 서비스명, 서비스분류, 운영현황, 도메인을 입력한다.
- API Key는 최대 3개까지 발급 가능하다고 안내되어 있다.

신청 시 권장 입력값:

| 신청 항목 | 권장값 |
|---|---|
| 활용분야 | 민간 |
| 활용유형 | 서비스용 - 웹, 모바일 웹 |
| 서비스명 | FieldGuard AI |
| 서비스분류 | 스마트농업 |
| 운영현황 | 개발 중 |
| 도메인 | 실제 배포 도메인. 미정이면 개발용 도메인 또는 로컬 서버 주소 입력 가능 여부 확인 필요 |
| 서비스설명 | 이 문서 2장의 공통 활용 목적 문구 사용 |

사용 예정 기능:

| 기능/엔드포인트 | 사용 목적 |
|---|---|
| `farmapApi.do` | 팜맵 지도 API 객체 로드 |
| `farmmapApi/getFarmmapDataSeachPnu.do` | PNU 기준 필지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachXY.do` | 좌표 기준 필지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachRadius.do` | 반경 내 주변 농경지 정보 조회 |
| `farmmapApi/getFarmmapDataSeachAnalysisBasePnu.do` | PNU 기준 분석용 농경지 정보 조회 |

필수 파라미터:

| 파라미터 | 설명 |
|---|---|
| `apiKey` | 팜맵에서 발급받은 API Key |
| `domain` | API Key 발급 시 등록한 도메인 |
| `pnu` | 필지 고유번호 |
| `x`, `y` | 좌표 기준 조회 시 사용 |
| `epsg` | 좌표계 |
| `radius` | 반경 조회 거리 |
| `mapType` | 조회 지도 유형 |
| `columnType` | 응답 컬럼 언어/형식 |
| `apiVersion` | API 버전 |

주의:

- 팜맵 API는 도메인 제한이 있으므로 프론트엔드 직접 호출보다 서버 프록시 또는 등록 도메인 기반 호출 정책을 먼저 확정해야 한다.
- `Seach`는 문서와 샘플에 표시된 철자 그대로 사용한다. `Search`로 수정하면 호출 실패 가능성이 있다.

### 3.2 기상청 단기예보 조회서비스

| 항목 | 내용 |
|---|---|
| 신청처 | 공공데이터포털 |
| 공식 URL | https://www.data.go.kr/data/15084084/openapi.do |
| 서비스명 | 기상청_단기예보 조회서비스 |
| 기관 | 기상청 |
| 인증 방식 | 공공데이터포털 `ServiceKey` |
| API 유형 | REST |
| 데이터 형식 | JSON, XML |
| 이용료 | 무료 |
| 프로젝트 내 용도 | 날씨 위험도, 병해충 위험도, 작업 우선순위 산정 |
| 신청 우선순위 | 필수 |

신청 후 사용할 기능:

| 오퍼레이션 | 사용 목적 |
|---|---|
| `getUltraSrtNcst` | 초단기 실황. 현재 기온, 강수, 풍속 등 확인 |
| `getUltraSrtFcst` | 초단기 예보. 6시간 내 강수·기온 변화 확인 |
| `getVilageFcst` | 단기 예보. 오늘과 이번 주 위험도 계산 |

공통 요청 파라미터:

| 파라미터 | 설명 |
|---|---|
| `ServiceKey` | 공공데이터포털 인증키 |
| `pageNo` | 페이지 번호 |
| `numOfRows` | 한 페이지 결과 수 |
| `dataType` | `JSON` 권장 |
| `base_date` | 발표일자. 예: `20260505` |
| `base_time` | 발표시각. 예: `0600` |
| `nx` | 기상청 격자 X 좌표 |
| `ny` | 기상청 격자 Y 좌표 |

FieldGuard AI에서 사용할 주요 기상 항목:

| 항목 | 코드 예시 | 활용 |
|---|---|---|
| 강수량 | `RN1`, `PCP` | 배수로 점검, 침수 위험 |
| 강수형태 | `PTY` | 비/눈 여부 |
| 기온 | `T1H`, `TMP` | 고온·저온 위험 |
| 습도 | `REH` | 병해충 위험 상승 조건 |
| 풍속 | `WSD` | 강풍 대비 작업 |
| 하늘상태 | `SKY` | 작업 가능성 판단 |

주의:

- 위도/경도는 기상청 격자 `nx`, `ny`로 변환해야 한다.
- 공식 페이지 기준 활용신청은 PC 버전에서 가능하다고 안내되어 있다.
- 공식 페이지 기준 사용 가능 트래픽은 100,000건이며, 운영계정은 활용사례 등록으로 트래픽 증가 신청이 가능하다고 안내되어 있다.

### 3.3 농사로 OpenAPI

| 항목 | 내용 |
|---|---|
| 신청처 | 농사로 공공Data개방 |
| 공식 URL | https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191 |
| 인증 방식 | 농사로 OpenAPI 인증키 |
| 신청 전제 | 본인인증, OpenAPI 신청, 승인 후 인증키 확인 |
| 기본 호출 URL | `http://api.nongsaro.go.kr/service` |
| 프로젝트 내 용도 | 병해충, 농작업, 농약안전사용지침, 재해예방 정보 |
| 신청 우선순위 | 필수 |

공식 페이지 기준 신청 절차:

1. 본인명의 휴대폰 본인인증
2. 농사로 OpenAPI 신청
3. 승인 후 신청 내역에서 인증키 확인
4. 발급받은 인증키와 샘플을 참조해 서비스 제작

신청 시 활용 목적에 반드시 포함할 데이터:

| 구분 | 농사로 API명 | 오퍼레이션 | 프로젝트 내 활용 |
|---|---|---|---|
| 필수 | 병해충발생정보 | `dbyhsCccrrncInfoYear`, `dbyhsCccrrncInfoList` | 작물별 병해충 위험 후보 생성 |
| 필수 | 주간농사정보 | `weekFarmInfoList` | 이번 주 농작업 추천, 작업 카드 근거 |
| 필수 | 농작업일정 정보 | `workScheduleGrpList`, `workScheduleLst`, `workScheduleEraInfoLst`, `workScheduleDtl` | 작물별 생육시기·작업 일정 반영 |
| 필수 | 농약안전사용지침 | `nationList`, `agchmSafeManualList` | 작물·병해충 기준 공식 안전사용지침 확인 |
| 필수 | 농작물재해예방정보 | `frcDsstrPrevntYear`, `frcDsstrPrevntLst` | 고온, 저온, 강풍, 호우 등 재해 체크리스트 생성 |

농사로 API별 신청/참고 URL:

| API명 | 매뉴얼/샘플 |
|---|---|
| 병해충발생정보 | https://www.nongsaro.go.kr/portal/apiManual/dbyhsCccrrncInfo.zip |
| 주간농사정보 | https://www.nongsaro.go.kr/portal/apiManual/weekFarmInfo.zip |
| 농작업일정 정보 | https://www.nongsaro.go.kr/portal/apiManual/farmWorkingPlanNew.zip |
| 농약안전사용지침 | https://www.nongsaro.go.kr/portal/apiManual/agchmSafeManual.zip |
| 농작물재해예방정보 | https://www.nongsaro.go.kr/portal/apiManual/frcDsstrPrevnt.zip |

주의:

- 농약안전사용지침은 농약 처방이 아니라 공식 지침 확인 기능으로만 사용한다.
- 병해충발생정보는 특정 필지의 확정 진단 근거가 아니다. 날씨·작물 조건과 결합해 위험 후보로만 표시한다.
- 로컬 샘플 기준 기본 호출 URL은 `http://api.nongsaro.go.kr/service`이다. 운영 구현 전 HTTPS 지원 여부는 별도 확인 필요하다. 현재 로컬 가이드만으로는 HTTPS 지원 여부에 대한 확실한 정보 없음.

### 3.4 Gemini API

| 항목 | 내용 |
|---|---|
| 신청처 | Google AI Studio |
| API Key URL | https://aistudio.google.com/app/apikey |
| 공식 문서 | https://ai.google.dev/gemini-api/docs |
| 인증 방식 | `GEMINI_API_KEY` |
| 프로젝트 내 용도 | 병징 사진 분석, JSON 구조화 출력, 작업 카드/체크리스트 생성, 상담 리포트 요약 |
| 신청 우선순위 | 필수 |

사용 기능:

| 기능 | 공식 문서 | 활용 |
|---|---|---|
| Image Understanding | https://ai.google.dev/gemini-api/docs/image-understanding | 잎, 줄기, 열매, 밭 사진 기반 병해충 의심 후보 분석 |
| Structured Outputs | https://ai.google.dev/gemini-api/docs/structured-output | AI 결과를 JSON 스키마로 받아 UI 카드에 안정적으로 표시 |
| Text Generation | https://ai.google.dev/gemini-api/docs/text-generation | 공공데이터 요약, 농민용 쉬운 문장 변환 |

구현 원칙:

- API Key는 프론트엔드에 노출하지 않는다.
- 서버에서 Gemini API를 호출한다.
- 환경 변수명은 `GEMINI_API_KEY`로 둔다.
- 사진 판독 결과는 `확정 진단`이 아니라 `의심 후보`로 표시한다.
- Structured Output 사용 시 JSON Schema 검증을 서버에서 한 번 더 수행한다.

보안 주의:

- Gemini 공식 문서는 API Key를 비밀번호처럼 취급하고, 소스코드에 커밋하지 말라고 안내한다.
- 운영 환경에서는 API Key를 서버 환경 변수나 Secret Manager에 저장한다.
- 클라이언트 직접 호출은 금지한다.

## 4. 선택 API

### 4.1 지도 배경 API

현재 필수로 확정된 것은 아니다. 팜맵 지도 API만으로 필지 지도 표시가 충분하면 신청하지 않는다.

| 후보 | 사용 조건 |
|---|---|
| VWorld 지도 API | 팜맵 지도 위에 일반 지도 배경, 주소 검색, 행정구역 레이어가 필요할 때 |
| 국토지리정보원 지도 API | 국가 기본도 배경이 필요할 때 |

판단 기준:

- 필지 지도 화면에서 팜맵 기본 지도만으로 위치 이해가 가능하면 보류한다.
- 주소 검색 UX가 부족하면 별도 주소/지도 API를 추가 검토한다.

## 5. 활용신청 체크리스트

### 5.1 신청 전 준비값

| 항목 | 값 |
|---|---|
| 서비스명 | FieldGuard AI |
| 서비스 유형 | Web App, 모바일 웹 대응 |
| 운영 상태 | 개발 중 |
| 활용 분야 | 스마트농업, 농업 위험관리, 농업 의사결정 보조 |
| 주요 사용자 | 농민, 농업 현장 관리자, 농업기술센터 상담 준비 사용자 |
| 데이터 이용 목적 | 필지·기상·병해충·농작업·농약안전사용 공공데이터를 통합해 위험도와 작업 우선순위 제공 |
| 비고 | 확정 진단 및 농약 처방 목적 아님 |

### 5.2 실제 신청 순서

1. 팜맵 OpenAPI 인증키 발급
2. 공공데이터포털에서 `기상청_단기예보 조회서비스` 활용신청
3. 농사로 OpenAPI 신청
4. Google AI Studio에서 Gemini API Key 생성
5. 각 API Key를 `.env` 또는 서버 Secret에 저장
6. 개발 서버에서 샘플 호출 확인

### 5.3 환경 변수명 권장

```env
FARMMAP_API_KEY=
FARMMAP_DOMAIN=
KMA_SERVICE_KEY=
NONGSARO_API_KEY=
GEMINI_API_KEY=
```

## 6. 신청 누락 시 영향

| API | 누락 시 영향 |
|---|---|
| 팜맵 OpenAPI | 필지 기반 서비스가 불가능. 주소/좌표만 저장하는 반쪽 기능이 됨 |
| 기상청 단기예보 | 강수, 고온, 저온, 강풍 위험도 계산 불가 |
| 농사로 OpenAPI | 병해충 후보, 작업 카드 근거, 농약안전사용지침 확인 불가 |
| Gemini API | 사진 판독, 작업 카드 자동 요약, 상담 리포트 자동 생성 불가 |

## 7. 출처

- 농식품 팜맵 서비스: https://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=3
- 공공데이터포털 기상청 단기예보 조회서비스: https://www.data.go.kr/data/15084084/openapi.do
- 농사로 공공Data개방: https://www.nongsaro.go.kr/portal/ps/psz/psza/contentMain.ps?menuId=PS00191
- Gemini Image Understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini Structured Outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini API Key: https://ai.google.dev/gemini-api/docs/api-key
