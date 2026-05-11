# 농식품 공공 API 목록 정리

확인일: 2026-04-30 KST

## 산출물

| 파일 | 건수 | 내용 |
| --- | ---: | --- |
| [통합 API 목록 CSV](./농식품_공공_API_통합목록.csv) | 2,926 | 아래 수집원을 합친 작업용 목록. 중복 가능성을 보존하기 위해 출처별 행을 제거하지 않음 |
| [KADX OpenAPI 상품](./농식품_빅데이터_거래소_KADX_OpenAPI_상품.csv) | 1,346 | 농식품 빅데이터 거래소 OpenAPI 데이터상품 목록 |
| [data.go.kr 농림축산식품 키워드 OpenAPI](./공공데이터포털_농림축산식품_OpenAPI_검색결과.csv) | 656 | 범정부 공공데이터 포털에서 `농림축산식품` 검색 후 OpenAPI 탭 기준 |
| [농식품 공공데이터 포털 API 데이터 정보](./농식품_공공데이터포털_API_데이터정보.csv) | 636 | 농식품 공공데이터 포털이 제공한 API 데이터 정보 CSV |
| [농사로 OpenAPI](./농사로_OpenAPI_목록.csv) | 133 | 농사로 OpenAPI 목록, 설명, REST/AJAX 예제 및 매뉴얼 링크 |
| [스마트팜코리아 OpenAPI](./스마트팜코리아_OpenAPI_서비스.csv) | 89 | 스마트팜 빅데이터, 품목별/작기별 데이터셋, 노지/축산/혁신밸리, R&D 모델 API |
| [팜맵 OpenAPI](./팜맵_OpenAPI_서비스.csv) | 56 | 팜맵 지도 API, 데이터 API, WMS/WFS 서비스 목록 |
| [축산유통정보 관련 OpenAPI](./축산유통정보_축산물품질평가원_OpenAPI.csv) | 10 | data.go.kr에 공개된 축산물품질평가원 OpenAPI |
| [수집 건수 요약 JSON](./수집_건수_요약.json) | - | 파일별 행 수 요약 |

## 출처별 기능 요약

| 출처 | 확인한 API 범위 | 주요 기능 |
| --- | --- | --- |
| 농식품 공공데이터 포털 | API 데이터 정보 CSV 636건 | 농림축산식품부/EPIS 등 농식품 API의 ID, 명칭, 영문명, 버전, 사용 여부 확인 |
| KADX 농식품 빅데이터 거래소 | OpenAPI 데이터상품 1,346건 | 한우, 경영체, 재해보험, 토양, 병해충, 농산물 유통, 가격, 검색 순위, 결합 데이터 등 상품별 API 상세 페이지 연결 |
| data.go.kr | `농림축산식품` 키워드 OpenAPI 656건 | 중앙부처, 지자체, 공공기관의 농림·축산·식품 관련 범정부 OpenAPI 검색 결과 |
| 농사로 | OpenAPI 133건 | 작목, 병해충, 농업기술, 농자재, 농업 콘텐츠 등의 REST/AJAX 예제와 매뉴얼 제공 |
| 스마트팜코리아 | OpenAPI/모델 API 89건 | 시설원예 환경·제어·생육·경영 데이터, 품목별/작기별 데이터마트, 노지/축산/혁신밸리 데이터, 작물·병해·기상 R&D 모델 API |
| 축산유통정보/EKAPEPIA | data.go.kr 공개 OpenAPI 10건 | 축산물 등급판정, 통합이력, 쇠고기 이력, 등급판정확인서, 유통정보, 경락가격, 가금산물 가격, 농장식별번호, 계란등급, DNA 동일성검사 업소 정보 |
| 팜맵 서비스 | 팜맵 API 명세서 56건 | 지도 객체 생성, 이벤트/컨트롤/마커/벡터/레이어 관리, PNU·좌표·반경·법정동·변경일자 기반 팜맵 데이터 조회, WMS/WFS |
| 농넷 | 공식 공개 API 목록 확인불가 | 확인 범위에서 농넷 자체 OpenAPI 목록은 찾지 못함. 농넷은 농식품 빅데이터 거래소로 연결되는 메뉴를 제공 |

## 원본 링크

- 농식품 공공데이터 포털 API 데이터 정보: <https://data.mafra.go.kr/opendata/data/indexOpenDataDetail.do?data_id=20240806000000002609>
- KADX OpenAPI 데이터상품: <https://kadx.co.kr/opmk/frn/productList/openApi>
- data.go.kr 검색 결과: <https://www.data.go.kr/tcs/dss/selectDataSetList.do?dType=API&keyword=%EB%86%8D%EB%A6%BC%EC%B6%95%EC%82%B0%EC%8B%9D%ED%92%88>
- 농사로 OpenAPI 목록: <https://nongsaro.go.kr/portal/ps/psn/psnj/openApiLst.ps>
- 스마트팜코리아 OpenAPI: <https://www.smartfarmkorea.net/openApi/openApiList.do?menuId=M11040301>
- 스마트팜코리아 R&D 모델 API: <https://www.smartfarmkorea.net/rndModel/info.do?menuId=M11040307>
- 팜맵 FAQ 및 API 명세서 다운로드 안내: <https://agis.epis.or.kr/ASD/guide/faq.do?bbsSn=3>
- 팜맵 API 명세서 다운로드 URL: <https://agis.epis.or.kr/ASD/common/manualDownloadURL.do?type=farmmap_api>
- 농넷: <https://www.nongnet.or.kr/>
- 축산물품질평가원 data.go.kr 예시: <https://www.data.go.kr/data/15058822/openapi.do>

## 검증 제한

- 회원 전용, 비공개, 신청 후 노출되는 API는 공개 화면과 공개 다운로드 파일만으로는 전체 확인이 불가능하다.
- KADX, 농식품 공공데이터 포털, data.go.kr에는 같은 API가 다른 이름이나 상품으로 중복 노출될 수 있다. 중복 제거는 하지 않았다.
- data.go.kr 목록은 전체 포털 전체가 아니라 `농림축산식품` 키워드 검색 결과 기준이다.
- 농넷 자체 공개 OpenAPI 카탈로그는 확인 범위에서 확실한 정보 없음.
