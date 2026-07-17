import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Bug, Camera, ChevronLeft, ChevronRight, Clock, CloudRain, Droplets, FileText, Loader2, Pill, Sprout, Thermometer, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { RiskBadge } from "@/components/RiskBadge";
import { useSelectedField } from "@/context/SelectedFieldContext";
import {
  buildDashboardRiskOverview,
  getDashboardDisasterSourceState,
} from "@/domain/dashboard/dashboardPresentation";
import { assessWeatherRisk } from "@/domain/weather/weatherRisk";
import { RiskLevel, m2ToPyeong, scoreToLevel } from "@/lib/copy";
import { getLatestWeatherRisk, getPestRisks } from "@/services/dashboardService";
import { generateAndSavePestRiskForecast } from "@/services/pestRiskForecastService";
import { getPendingTaskCardsByField } from "@/services/taskService";
import { getTimelineItemsByField } from "@/services/timelineService";
import { getLiveWeatherByLatLng, type SourceStatus } from "@/services/weatherLiveService";
import {
  getAllNpmsPestCandidates,
  getNpmsPestDetail,
  type NpmsPestCandidate,
} from "@/services/npmsPestService";

const NCPMS_CANDIDATES_PAGE_SIZE = 6;
const LIVE_WEATHER_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function sourceStatusLabel(status: SourceStatus): string {
  if (status === "connected") return "정상 수집";
  if (status === "delayed") return "응답 지연";
  if (status === "rate_limited") return "요청 한도 초과";
  return "공식 데이터 조회 불가";
}

function sourceStatusVariant(status: SourceStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "secondary";
  if (status === "delayed") return "outline";
  return "destructive";
}

function isOlderThanHours(isoString: string, hours: number): boolean {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > hours * 60 * 60 * 1000;
}

function compactOfficialSourceLabel(source: string): string {
  return source.replace(/\s+\(https?:\/\/.+\)$/i, "");
}

function timelineTypeLabel(type: string): string {
  if (type === "risk") return "위험";
  if (type === "task") return "작업";
  if (type === "diagnosis") return "진단";
  if (type === "report") return "상담";
  if (type === "source") return "자료";
  return "기록";
}

function npmsCandidateTypeLabel(kind: NpmsPestCandidate["kind"]): string {
  return kind === "disease" ? "병" : "해충";
}

export default function Dashboard() {
  const { fields, selected, setSelectedId } = useSelectedField();
  const queryClient = useQueryClient();
  const [selectedNpmsCandidateId, setSelectedNpmsCandidateId] = useState<string | null>(null);
  const [npmsCandidatePage, setNpmsCandidatePage] = useState(1);
  const selectedCropName = selected?.crop_name.trim() ?? "";

  const { data: dbWeather } = useQuery({
    queryKey: ["weather", selected?.id],
    enabled: !!selected,
    queryFn: () => getLatestWeatherRisk(selected!.id),
  });

  const { data: liveWeather } = useQuery({
    queryKey: ["weather-live", selected?.id, selected?.lat, selected?.lng],
    enabled: !!selected,
    queryFn: () => getLiveWeatherByLatLng(selected!.lat, selected!.lng, selected!.id),
    refetchInterval: LIVE_WEATHER_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!selected?.id || liveWeather?.sourceStatus !== "connected" || !liveWeather.collectedAt) return;
    void queryClient.invalidateQueries({ queryKey: ["fields"] });
  }, [liveWeather?.collectedAt, liveWeather?.sourceStatus, queryClient, selected?.id]);

  const { data: pestRisks } = useQuery({
    queryKey: ["pest", selected?.id],
    enabled: !!selected,
    queryFn: () => getPestRisks(selected!.id),
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks", selected?.id],
    enabled: !!selected,
    queryFn: () => getPendingTaskCardsByField(selected!.id),
  });

  const { data: timelineItems = [] } = useQuery({
    queryKey: ["timeline", selected?.id],
    enabled: !!selected,
    queryFn: () => getTimelineItemsByField(selected!.id, 8),
  });

  const {
    data: npmsCandidateSearch = { candidates: [], totalCount: 0 },
    isLoading: npmsCandidatesLoading,
  } = useQuery({
    queryKey: ["npms-pest-candidates", selected?.id, selectedCropName],
    enabled: !!selected && selectedCropName.length > 0,
    queryFn: () => getAllNpmsPestCandidates(selectedCropName),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const npmsCandidates = npmsCandidateSearch.candidates;

  useEffect(() => {
    setNpmsCandidatePage(1);
  }, [selected?.id, selectedCropName]);

  const selectedNpmsCandidate =
    npmsCandidates.find((candidate) => candidate.id === selectedNpmsCandidateId) ?? null;

  const {
    data: npmsDetail,
    isLoading: npmsDetailLoading,
    isError: npmsDetailError,
  } = useQuery({
    queryKey: [
      "npms-pest-detail",
      selectedNpmsCandidate?.detailServiceCode,
      selectedNpmsCandidate?.detailKey,
    ],
    enabled: !!selectedNpmsCandidate?.detailServiceCode && !!selectedNpmsCandidate?.detailKey,
    queryFn: () => getNpmsPestDetail(selectedNpmsCandidate!),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const hasConnectedLiveWeather = liveWeather?.sourceStatus === "connected";
  const dbWeatherAssessment = dbWeather
    ? assessWeatherRisk({
        precipitation: dbWeather.precipitation,
        temperature: dbWeather.temperature,
        wind: dbWeather.wind,
        humidity: dbWeather.humidity,
      })
    : null;
  const forecastWeather = {
    precipitation: hasConnectedLiveWeather
      ? liveWeather.precipitation
      : dbWeather?.precipitation ?? liveWeather?.precipitation ?? null,
    temperature: hasConnectedLiveWeather
      ? liveWeather.temperature
      : dbWeather?.temperature ?? liveWeather?.temperature ?? null,
    wind: hasConnectedLiveWeather
      ? liveWeather.wind
      : dbWeather?.wind ?? liveWeather?.wind ?? null,
    humidity: hasConnectedLiveWeather
      ? liveWeather.humidity
      : dbWeather?.humidity ?? liveWeather?.humidity ?? null,
  };
  const forecastWeatherRiskScore = hasConnectedLiveWeather
    ? liveWeather.riskScore
    : dbWeatherAssessment?.score ?? selected?.risk_score ?? null;

  const { data: forecastPestRisks = [] } = useQuery({
    queryKey: [
      "pest-risk-forecast",
      selected?.id,
      selectedCropName,
      liveWeather?.collectedAt,
      dbWeather?.forecast_at,
    ],
    enabled: !!selected && selectedCropName.length > 0 && (!!liveWeather || !!dbWeather),
    queryFn: () =>
      generateAndSavePestRiskForecast({
        fieldId: selected!.id,
        cropName: selectedCropName,
        weather: forecastWeather,
        weatherRiskScore: forecastWeatherRiskScore,
      }),
    staleTime: 30 * 60 * 1000,
  });

  if (!selected) {
    return (
      <div className="grid h-full place-items-center text-muted-foreground">
        등록된 필지가 없습니다. 설정에서 먼저 필지를 등록하세요.
      </div>
    );
  }

  const weather = {
    ...forecastWeather,
    summary:
      hasConnectedLiveWeather
        ? liveWeather.summary
        : dbWeather?.summary ?? liveWeather?.summary ?? null,
  };

  const weatherSourceStatus: SourceStatus = hasConnectedLiveWeather
    ? "connected"
    : (dbWeather?.source_status as SourceStatus | undefined) ?? liveWeather?.sourceStatus ?? "unavailable";
  const weatherCollectedAt = hasConnectedLiveWeather
    ? liveWeather.collectedAt
    : dbWeather?.collected_at ?? dbWeather?.forecast_at ?? liveWeather?.collectedAt ?? null;
  const showStaleBadge = weatherCollectedAt ? isOlderThanHours(weatherCollectedAt, 3) : false;
  const currentRiskScore = hasConnectedLiveWeather
    ? liveWeather.riskScore ?? 0
    : dbWeather?.source_status === "connected" && dbWeatherAssessment
      ? dbWeatherAssessment.score
      : selected.risk_score;
  const displayedPestRisks = forecastPestRisks.length > 0 ? forecastPestRisks : pestRisks ?? [];
  const riskOverview = buildDashboardRiskOverview({
    weather: {
      score: currentRiskScore,
      summary: weather.summary,
      sourceStatus: weatherSourceStatus,
    },
    pestRisks: displayedPestRisks.map((risk) => ({
      candidateName: risk.candidate_name,
      score: risk.score,
      reasons: risk.reasons,
      officialSourceCount: risk.official_sources.length,
    })),
  });
  const disasterSourceState = getDashboardDisasterSourceState(forecastWeather);
  const displayedRiskScore = riskOverview.totalScore;
  const displayedRiskLevel: RiskLevel = riskOverview.totalLevel;
  const displayCropName = selectedCropName || "작물 미입력";
  const npmsCandidateCount = npmsCandidates.length;
  const npmsCandidatePageCount = Math.max(1, Math.ceil(npmsCandidateCount / NCPMS_CANDIDATES_PAGE_SIZE));
  const currentNpmsCandidatePage = Math.min(npmsCandidatePage, npmsCandidatePageCount);
  const npmsCandidateStartIndex = (currentNpmsCandidatePage - 1) * NCPMS_CANDIDATES_PAGE_SIZE;
  const npmsCandidateEndIndex = Math.min(npmsCandidateStartIndex + NCPMS_CANDIDATES_PAGE_SIZE, npmsCandidateCount);
  const visibleNpmsCandidates = npmsCandidates.slice(npmsCandidateStartIndex, npmsCandidateEndIndex);
  const showNpmsCandidatePagination = npmsCandidateCount > NCPMS_CANDIDATES_PAGE_SIZE;

  return (
    <>
    <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
      {/* 필지 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">내 필지</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {fields.map((f) => {
            const cropName = f.crop_name.trim() || "작물 미입력";

            return (
              <button
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                  f.id === selected.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{f.name}</span>
                  <RiskBadge
                    level={f.id === selected.id ? displayedRiskLevel : (f.risk_level as RiskLevel)}
                    size="sm"
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-6 gap-1 px-2 text-[11px]">
                    <Sprout className="h-3 w-3" aria-hidden="true" />
                    생산 작물
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">{cropName}</span>
                  {f.farmmap_meta.classification ? (
                    <Badge variant="outline" className="h-6 px-2 text-[11px]">
                      {f.farmmap_meta.classification}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  면적 {f.area_m2.toLocaleString()}㎡ ({m2ToPyeong(f.area_m2).toLocaleString()}평)
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* 오늘 위험도 */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">오늘 위험도</CardTitle>
              <RiskBadge level={displayedRiskLevel} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="text-5xl font-bold">{displayedRiskScore}</div>
              <div className="pb-1 text-sm text-muted-foreground">/ 100</div>
              <Badge variant="outline" className="mb-1">
                {riskOverview.totalDriverKey === "pest" ? "병해충 확인 권고 기준" : "기상 위험 기준"}
              </Badge>
              <Badge variant="secondary" className="mb-1">선택 작물 {displayCropName}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{riskOverview.explanation}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {riskOverview.sections.map((section) => (
                <div key={section.key} className="rounded-md border bg-surface-muted p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{section.title}</div>
                    <RiskBadge level={section.level} size="sm" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold">{section.score}</span>
                    <span className="text-xs text-muted-foreground">점</span>
                  </div>
                  <div className="mt-2 text-[11px] font-medium text-muted-foreground">{section.apiName}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{section.summary}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">위험도 산출 근거</div>
              <ul className="space-y-1">
                {riskOverview.summaryBullets.map((bullet, index) => (
                  <li key={`${index}-${bullet}`} className="text-sm">
                    - {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">날씨 위험</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={sourceStatusVariant(weatherSourceStatus)}>{sourceStatusLabel(weatherSourceStatus)}</Badge>
                {showStaleBadge && <Badge variant="outline">정보 갱신 필요</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {weatherSourceStatus !== "connected" && (
              <p className="text-xs text-muted-foreground">
                날씨 데이터를 불러오지 못했습니다. 마지막 수집 정보를 표시하며, 잠시 후 다시 시도할 수 있습니다.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <WeatherTile icon={CloudRain} label="강수" value={`${weather?.precipitation ?? 0}mm`} />
              <WeatherTile icon={Thermometer} label="기온" value={`${weather?.temperature ?? "-"}도`} />
              <WeatherTile icon={Wind} label="풍속" value={`${weather?.wind ?? "-"}m/s`} />
              <WeatherTile icon={Droplets} label="습도" value={`${weather?.humidity ?? "-"}%`} />
            </div>
            {weatherCollectedAt && (
              <p className="text-[11px] text-muted-foreground">
                수집 시각: {new Date(weatherCollectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">NCPMS 작물별 병해충 확인 권고</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayedPestRisks.map((p) => (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.candidate_name}</div>
                  <RiskBadge level={scoreToLevel(p.score)} size="sm" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.reasons.join(" · ")}</div>
                {p.official_sources.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <div className="text-xs font-medium text-muted-foreground">공식 근거자료</div>
                    <ul className="mt-1 space-y-1">
                      {p.official_sources.slice(0, 4).map((source, index) => (
                        <li key={`${p.id}-source-${index}`} className="text-xs text-muted-foreground">
                          {compactOfficialSourceLabel(source)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {displayedPestRisks.length === 0 && (
              <p className="text-sm text-muted-foreground">표시할 위험 예보가 없습니다.</p>
            )}

            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">NCPMS 작물별 후보</div>
                  <div className="text-xs text-muted-foreground">
                    입력 작물명 {displayCropName} 기준 Open API 결과입니다. 실제 발생 확정이 아니라 현장 확인 후보입니다.
                  </div>
                </div>
                <Badge variant="outline">{npmsCandidateCount}건</Badge>
              </div>

              {npmsCandidatesLoading && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                </div>
              )}

              {!npmsCandidatesLoading && npmsCandidateCount === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  입력 작물명 {displayCropName} 기준으로 매칭되는 NCPMS 병해충 후보가 없습니다.
                </p>
              )}

              {!npmsCandidatesLoading && npmsCandidateCount > 0 && (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {visibleNpmsCandidates.map((candidate) => (
                      <div key={candidate.id} className="flex gap-3 rounded-md border bg-surface-muted p-2">
                        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-background">
                          {candidate.thumbImg ? (
                            <img
                              src={candidate.thumbImg}
                              alt={`${candidate.name} 대표 이미지`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Bug className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="shrink-0">
                              {npmsCandidateTypeLabel(candidate.kind)}
                            </Badge>
                            <div className="truncate text-sm font-medium">{candidate.name}</div>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            입력 작물: {displayCropName}
                            {candidate.cropName !== displayCropName ? ` · NCPMS: ${candidate.cropName}` : ""}
                          </div>
                          {candidate.scientificName && (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{candidate.scientificName}</div>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 px-2 text-xs"
                            disabled={!candidate.detailServiceCode || !candidate.detailKey}
                            onClick={() => setSelectedNpmsCandidateId(candidate.id)}
                          >
                            자세히보기
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {showNpmsCandidatePagination && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-muted-foreground">
                        {npmsCandidateStartIndex + 1}-{npmsCandidateEndIndex} / {npmsCandidateCount}건
                      </div>
                      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                        <PaginationContent>
                          <PaginationItem>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="이전 페이지"
                              disabled={currentNpmsCandidatePage === 1}
                              onClick={() => setNpmsCandidatePage((page) => Math.max(1, page - 1))}
                            >
                              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </PaginationItem>
                          {Array.from({ length: npmsCandidatePageCount }, (_, index) => {
                            const page = index + 1;
                            const isActive = page === currentNpmsCandidatePage;

                            return (
                              <PaginationItem key={page}>
                                <Button
                                  type="button"
                                  variant={isActive ? "outline" : "ghost"}
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={`${page} 페이지`}
                                  aria-current={isActive ? "page" : undefined}
                                  onClick={() => setNpmsCandidatePage(page)}
                                >
                                  {page}
                                </Button>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="다음 페이지"
                              disabled={currentNpmsCandidatePage === npmsCandidatePageCount}
                              onClick={() => setNpmsCandidatePage((page) => Math.min(npmsCandidatePageCount, page + 1))}
                            >
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="rounded-md border bg-surface-muted p-3">
              <div className="text-xs font-medium text-muted-foreground">{disasterSourceState.apiName}</div>
              <p className="mt-1 text-xs text-muted-foreground">{disasterSourceState.message}</p>
              {disasterSourceState.keywords.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  조회 키워드: {disasterSourceState.keywords.join(", ")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 오늘 작업 카드 */}
      <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">오늘 작업</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/tasks">
                전체 <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(tasks ?? []).slice(0, 5).map((t) => (
            <div key={t.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t.priority}순위</Badge>
                <div className="text-sm font-medium">{t.title}</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{t.reason}</div>
              <div className="mt-1 text-xs text-muted-foreground">약 {t.duration_min}분</div>
            </div>
          ))}
          {(!tasks || tasks.length === 0) && (
            <p className="text-sm text-muted-foreground">대기 중인 작업이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            타임라인
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {timelineItems.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{timelineTypeLabel(item.type)}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{item.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.summary}</div>
            </div>
          ))}
          {timelineItems.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 저장된 타임라인 기록이 없습니다.</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 하단 빠른 진입 */}
      <div className="lg:col-span-3 grid gap-4 md:grid-cols-3">
        <QuickCard icon={Camera} title="사진 판독" desc="병징 사진으로 의심 후보 확인" to="/diagnosis" />
        <QuickCard icon={Pill} title="농약 안전사용지침" desc="농사로 공식 자료 검색" to="/reports?tab=pesticide" />
        <QuickCard icon={FileText} title="상담 리포트" desc="농업기술센터 상담용 자료 모음" to="/reports" />
      </div>
    </div>
    <Sheet open={!!selectedNpmsCandidate} onOpenChange={(open) => !open && setSelectedNpmsCandidateId(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{selectedNpmsCandidate?.name ?? "NCPMS 상세정보"}</SheetTitle>
          <SheetDescription>
            {selectedNpmsCandidate
              ? `${displayCropName} 기준 · NCPMS ${selectedNpmsCandidate.cropName} · ${npmsCandidateTypeLabel(selectedNpmsCandidate.kind)}`
              : "국가농작물병해충관리시스템 상세정보"}
          </SheetDescription>
        </SheetHeader>

        {selectedNpmsCandidate && (
          <div className="mt-5 space-y-5">
            {selectedNpmsCandidate.thumbImg && (
              <div className="overflow-hidden rounded-md border bg-surface-muted">
                <img
                  src={selectedNpmsCandidate.thumbImg}
                  alt={`${selectedNpmsCandidate.name} 대표 이미지`}
                  className="h-56 w-full object-cover"
                />
              </div>
            )}

            {npmsDetailLoading && (
              <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                NCPMS 상세정보를 조회하는 중입니다.
              </div>
            )}

            {npmsDetailError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                NCPMS 상세정보를 불러오지 못했습니다.
              </div>
            )}

            {!npmsDetailLoading && !npmsDetailError && npmsDetail && (
              <>
                <div className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{npmsCandidateTypeLabel(npmsDetail.kind)}</Badge>
                    <Badge variant="outline">입력 작물 {displayCropName}</Badge>
                    {npmsDetail.cropName && <Badge variant="outline">{npmsDetail.cropName}</Badge>}
                  </div>
                  <div className="mt-3 text-lg font-semibold">{npmsDetail.name}</div>
                  {npmsDetail.scientificName && (
                    <div className="mt-1 text-sm text-muted-foreground">{npmsDetail.scientificName}</div>
                  )}
                </div>

                {npmsDetail.images.length > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-medium">공식 이미지</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {npmsDetail.images.slice(0, 6).map((image) => (
                        <figure key={image.url} className="overflow-hidden rounded-md border bg-surface-muted">
                          <img src={image.url} alt={image.title} className="h-36 w-full object-cover" loading="lazy" />
                          <figcaption className="space-y-0.5 p-2 text-xs">
                            <div className="line-clamp-2 font-medium">{image.title}</div>
                            {image.category && <div className="text-muted-foreground">{image.category}</div>}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}

                {npmsDetail.sections.length > 0 && (
                  <div className="space-y-3">
                    {npmsDetail.sections.map((section) => (
                      <section key={section.title} className="rounded-md border p-4">
                        <h3 className="text-sm font-semibold">{section.title}</h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                          {section.content}
                        </p>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

function WeatherTile({ icon: Icon, label, value }: { icon: typeof CloudRain; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-surface-muted p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function QuickCard({ icon: Icon, title, desc, to }: { icon: typeof Camera; title: string; desc: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-md border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}
