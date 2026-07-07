import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, ChevronDown, Clock, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSelectedField } from "@/context/SelectedFieldContext";
import {
  getNongsaroSchedulePeriod,
  isNongsaroScheduleEraInPeriods,
} from "@/domain/tasks/taskCardEngine";
import { normalizeHtmlText } from "@/domain/text/html";
import type { TaskCard, TaskCheck, TaskSource } from "@/domain/tasks/types";
import { detectCriticalWeatherIncident } from "@/domain/weather/criticalWeatherIncident";
import { assessWeatherRisk } from "@/domain/weather/weatherRisk";
import { getLatestWeatherRisk, getPestRisks } from "@/services/dashboardService";
import { getWeeklyFarmInfos } from "@/services/nongsaroWeeklyService";
import {
  getWorkScheduleLookupForCrop,
  type NongsaroWorkScheduleLookup,
} from "@/services/nongsaroWorkScheduleService";
import { generateAndSaveTaskCardsForField } from "@/services/taskGenerationService";
import {
  getWeeklyFarmBriefing,
  getWeeklyFarmBriefingPdfSourceUrl,
} from "@/services/weeklyFarmBriefingService";
import { generateWeeklyFarmAlternativeBriefing } from "@/services/weeklyFarmAlternativeBriefingService";
import {
  filterVisibleWorkVideoRecommendations,
  getWorkVideoRecommendationsForEra,
  type WorkVideoRecommendation,
} from "@/services/nongsaroWorkVideoRecommendationService";
import {
  getTaskCardsByField,
  markTaskDone,
  reopenTask,
  updateTaskChecks,
} from "@/services/taskService";

const TASK_STALE_MS = 15 * 60 * 1000;
const WEEKLY_INFO_REFETCH_MS = 30 * 60 * 1000;
const WEEKLY_INFO_NOTIFY_PREFIX = "fieldguard.weeklyFarmInfo.notified.v1";

function dueTime(task: TaskCard): number {
  if (!task.due_at) return Date.now();
  const parsed = Date.parse(task.due_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatDueAt(task: TaskCard): string {
  if (!task.due_at) return "오늘";
  return new Date(task.due_at).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function sourceKind(source: TaskSource): string {
  const name = source.name.toLowerCase();
  if (name.includes("kma") || name.includes("기상")) return "기상";
  if (name.includes("농작업일정")) return "농작업일정";
  if (name.includes("주간농사정보")) return "주간농사정보";
  if (name.includes("ncpms") || name.includes("병해충")) return "병해충";
  if (name.includes("gemini") || name.includes("ai 보조") || name.includes("생성 ai")) return "AI";
  return "근거";
}

function taskSourceKinds(task: TaskCard): string[] {
  return Array.from(new Set((task.sources ?? []).map(sourceKind))).slice(0, 3);
}

function formatMonthEra(month: number | null, era: string | null): string {
  if (!month) return "";
  return `${month}월${era ? ` ${era}` : ""}`;
}

interface WorkScheduleEraView {
  beginMonth: number | null;
  endMonth: number | null;
  beginEra: string | null;
  endEra: string | null;
  farmWorkFlag: string | null;
  infoType: string | null;
  operationName: string;
}

function isEraInMonth(era: WorkScheduleEraView, month: number): boolean {
  const startMonth = era.beginMonth ?? era.endMonth;
  const endMonth = era.endMonth ?? era.beginMonth;
  if (!startMonth || !endMonth) return false;

  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

function formatEraPeriod(era: WorkScheduleEraView): string {
  const start = formatMonthEra(era.beginMonth ?? era.endMonth, era.beginEra);
  const end = formatMonthEra(era.endMonth ?? era.beginMonth, era.endEra);
  return start && end && start !== end ? `${start}-${end}` : (start || end || "시기 정보 없음");
}

function normalizeScheduleText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function formatEraMeta(era: WorkScheduleEraView, scheduleTitle: string): string | null {
  const workFlag = era.farmWorkFlag?.trim();
  if (!workFlag) return null;
  return normalizeScheduleText(workFlag) === normalizeScheduleText(scheduleTitle) ? null : workFlag;
}

function operationNameLines(operationName: string): string[] {
  return (normalizeHtmlText(operationName) ?? operationName)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function scheduleGroupLabel(infoType: string | null): string {
  const text = infoType?.trim();
  if (!text) return "기타 일정";
  if (text.includes("생육")) return "생육과정";
  if (text.includes("기상재해")) return "기상재해 및 예상 문제";
  if (text.includes("병충해") || text.includes("병해충")) return "병충해 방제";
  return text;
}

function eraChecklist(era: WorkScheduleEraView, groupLabel: string): string[] {
  const [primaryName] = operationNameLines(era.operationName);

  if (groupLabel.includes("기상재해")) {
    return ["기상 예보와 현장 상태 확인", "피해 징후 기록", "필요 시 보호·배수 조치 준비"];
  }

  if (groupLabel.includes("병충해") || groupLabel.includes("병해충")) {
    return ["병해충 발생 여부 관찰", "피해 부위 사진 기록", "공식 방제자료 확인"];
  }

  return [
    `${primaryName ?? "해당 작업"} 적용 여부 확인`,
    "필지 생육단계와 농작업일정 비교",
    "필요 자재·장비·인력 준비 상태 확인",
  ];
}

function groupScheduleEras(eras: WorkScheduleEraView[]): Array<{ label: string; eras: WorkScheduleEraView[] }> {
  const groups: Array<{ label: string; eras: WorkScheduleEraView[] }> = [];
  const groupIndexes = new Map<string, number>();

  for (const era of eras) {
    const label = scheduleGroupLabel(era.infoType);
    const existingIndex = groupIndexes.get(label);
    if (existingIndex !== undefined) {
      groups[existingIndex].eras.push(era);
      continue;
    }

    groupIndexes.set(label, groups.length);
    groups.push({ label, eras: [era] });
  }

  return groups;
}

function formatDetailPreview(detailText: string | null): string | null {
  if (!detailText) return null;
  return detailText.length > 240 ? `${detailText.slice(0, 240)}...` : detailText;
}

function videoMatchTypeLabel(matchType: WorkVideoRecommendation["matchType"]): string {
  if (matchType === "direct") return "직접 관련";
  if (matchType === "reference") return "참고";
  if (matchType === "low") return "낮음";
  return "제외";
}

function workScheduleLookupStatusLabel(
  lookup: NongsaroWorkScheduleLookup | null,
  cropName: string,
  currentMonthMatchCount: number,
): string | null {
  if (!lookup) return null;

  if (lookup.status === "empty-keyword") return "농작업일정 API 조회 성공 + 선택 작물 정보 없음";
  if (lookup.status === "group-match-failed") return "농작업일정 API 조회 성공 + 작물군 매칭 실패";
  if (lookup.status === "schedule-match-failed") {
    return `농작업일정 API 조회 성공 + ${cropName} 목록 매칭 실패`;
  }
  if (currentMonthMatchCount === 0) return "농작업일정 API 조회 성공 + 이번 달 매칭 결과 없음";
  return `농작업일정 API 조회 성공 + 이번 달 매칭 ${currentMonthMatchCount}건`;
}

function workScheduleStatusBadgeVariant(
  lookup: NongsaroWorkScheduleLookup | null,
  currentMonthMatchCount: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (!lookup) return "outline";
  if (lookup.status === "schedule-found" && currentMonthMatchCount > 0) return "secondary";
  return "outline";
}

function formatWeeklyInfoPeriod(item: { periodStart: string | null; periodEnd: string | null }): string {
  if (!item.periodStart || !item.periodEnd) return "기간 정보 없음";
  return `${item.periodStart} ~ ${item.periodEnd}`;
}

function formatWeatherValue(value: number | null | undefined, suffix: string): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value}${suffix}`;
}

function getWeeklyInfoNotificationKey(sourceKey: string): string {
  return `${WEEKLY_INFO_NOTIFY_PREFIX}:${sourceKey}`;
}

export default function Tasks() {
  const qc = useQueryClient();
  const { selected } = useSelectedField();

  const {
    data: tasks = [],
    isLoading: taskLoading,
  } = useQuery({
    queryKey: ["task-cards", selected?.id],
    enabled: !!selected,
    queryFn: () => getTaskCardsByField(selected!.id),
  });

  const {
    data: latestWeatherRisk,
    isLoading: weatherLoading,
  } = useQuery({
    queryKey: ["weather", selected?.id],
    enabled: !!selected,
    queryFn: () => getLatestWeatherRisk(selected!.id),
  });

  const {
    data: pestRisks = [],
    isLoading: pestLoading,
  } = useQuery({
    queryKey: ["pest", selected?.id],
    enabled: !!selected,
    queryFn: () => getPestRisks(selected!.id),
  });

  const {
    data: weeklyInfos = [],
    isLoading: weeklyLoading,
  } = useQuery({
    queryKey: ["tasks-weekly", selected?.crop_name],
    enabled: !!selected?.crop_name,
    queryFn: () => getWeeklyFarmInfos(selected!.crop_name),
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: WEEKLY_INFO_REFETCH_MS,
  });
  const latestWeeklyInfo = weeklyInfos.find((item) => item.isCurrent) ?? null;
  const latestWeeklyPdfSourceUrl = useMemo(
    () => (latestWeeklyInfo ? getWeeklyFarmBriefingPdfSourceUrl(latestWeeklyInfo) : null),
    [latestWeeklyInfo],
  );
  const latestWeeklyBriefingSourceUrl = useMemo(() => {
    if (!latestWeeklyInfo) return null;
    const candidates = [
      latestWeeklyPdfSourceUrl,
      latestWeeklyInfo.sourceUrl,
      ...latestWeeklyInfo.downUrlList,
    ];
    for (const candidate of candidates) {
      const trimmed = candidate?.trim();
      if (trimmed) return trimmed;
    }
    return null;
  }, [latestWeeklyInfo, latestWeeklyPdfSourceUrl]);
  const latestWeeklyBriefingKey = useMemo(() => {
    if (!selected?.crop_name || !latestWeeklyInfo || !latestWeeklyBriefingSourceUrl) return null;
    return [
      selected.crop_name,
      latestWeeklyInfo.sourceKey,
      latestWeeklyBriefingSourceUrl,
      latestWeeklyPdfSourceUrl ? "pdf" : "fallback",
      latestWeeklyInfo.publishedAt ?? "",
      latestWeeklyInfo.title,
      latestWeeklyInfo.periodStart ?? "",
      latestWeeklyInfo.periodEnd ?? "",
    ].join("|");
  }, [
    latestWeeklyBriefingSourceUrl,
    latestWeeklyInfo?.periodEnd,
    latestWeeklyInfo?.periodStart,
    latestWeeklyInfo?.publishedAt,
    latestWeeklyInfo?.sourceKey,
    latestWeeklyInfo?.title,
    latestWeeklyPdfSourceUrl,
    selected?.crop_name,
  ]);
  const [requestedWeeklyBriefingKey, setRequestedWeeklyBriefingKey] = useState<string | null>(null);
  const [manualWeeklyBriefingRefreshNonce, setManualWeeklyBriefingRefreshNonce] = useState(0);
  const forceNextWeeklyBriefingRefreshRef = useRef(false);
  const weeklyBriefingRequested =
    !!latestWeeklyBriefingKey && requestedWeeklyBriefingKey === latestWeeklyBriefingKey;
  const hasStoredWeeklyBriefing =
    latestWeeklyInfo?.summaryStatus === "ready" && latestWeeklyInfo.summaryPayload != null;
  const weeklyBriefingShouldLoad = weeklyBriefingRequested || hasStoredWeeklyBriefing;

  const weeklyBriefingFieldContext = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id,
      name: selected.name,
      address: selected.address,
      lat: selected.lat,
      lng: selected.lng,
      growthStage: selected.growth_stage,
      areaM2: selected.area_m2,
    };
  }, [selected]);

  const latestWeatherAssessment = useMemo(() => {
    if (!latestWeatherRisk) return null;
    return assessWeatherRisk({
      precipitation: latestWeatherRisk.precipitation,
      temperature: latestWeatherRisk.temperature,
      wind: latestWeatherRisk.wind,
      humidity: latestWeatherRisk.humidity,
    });
  }, [latestWeatherRisk]);

  const weeklyBriefingWeatherContext = useMemo(() => {
    if (!latestWeatherRisk) return null;
    return {
      sourceStatus: latestWeatherRisk.source_status,
      collectedAt: latestWeatherRisk.collected_at ?? latestWeatherRisk.forecast_at,
      precipitation: latestWeatherRisk.precipitation,
      temperature: latestWeatherRisk.temperature,
      wind: latestWeatherRisk.wind,
      humidity: latestWeatherRisk.humidity,
      riskScore: latestWeatherRisk.source_status === "connected" ? latestWeatherAssessment?.score ?? null : null,
      riskSummary: latestWeatherRisk.summary ?? latestWeatherAssessment?.summary ?? null,
    };
  }, [latestWeatherAssessment?.score, latestWeatherAssessment?.summary, latestWeatherRisk]);
  const weeklyBriefingWeatherIncidentKey = useMemo(
    () => detectCriticalWeatherIncident(weeklyBriefingWeatherContext)?.key ?? "normal",
    [weeklyBriefingWeatherContext],
  );

  const currentWeeklyInfos = useMemo(() => weeklyInfos.filter((item) => item.isCurrent), [weeklyInfos]);

  const {
    data: weeklyBriefing = null,
    isFetching: weeklyBriefingLoading,
    isError: weeklyBriefingError,
  } = useQuery({
    queryKey: [
      "weekly-farm-briefing",
      selected?.crop_name,
      latestWeeklyInfo?.sourceKey,
      latestWeeklyBriefingSourceUrl,
      latestWeeklyPdfSourceUrl,
      latestWeeklyInfo?.publishedAt,
      latestWeeklyInfo?.title,
      latestWeeklyInfo?.periodStart,
      latestWeeklyInfo?.periodEnd,
      selected?.id,
      weeklyBriefingWeatherIncidentKey,
      manualWeeklyBriefingRefreshNonce,
    ],
    enabled: weeklyBriefingShouldLoad,
    queryFn: ({ signal }) => {
      const forceRefresh = forceNextWeeklyBriefingRefreshRef.current;
      forceNextWeeklyBriefingRefreshRef.current = false;
      return getWeeklyFarmBriefing({
        cropName: selected!.crop_name,
        weeklyInfo: latestWeeklyInfo!,
        field: weeklyBriefingFieldContext,
        weather: weeklyBriefingWeatherContext,
        forceRefresh,
        signal,
      });
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const activeWeeklyBriefing = weeklyBriefingShouldLoad ? weeklyBriefing : null;

  const {
    data: workScheduleLookup = null,
    isLoading: workScheduleLoading,
    isError: workScheduleError,
  } = useQuery({
    queryKey: ["tasks-work-schedules", selected?.crop_name],
    enabled: !!selected?.crop_name,
    queryFn: () => getWorkScheduleLookupForCrop(selected!.crop_name),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const workSchedules = useMemo(() => workScheduleLookup?.schedules ?? [], [workScheduleLookup?.schedules]);

  const currentSchedulePeriod = useMemo(() => getNongsaroSchedulePeriod(new Date()), []);
  const weatherTaskRisk = useMemo(() => {
    if (!latestWeatherRisk || latestWeatherRisk.source_status !== "connected" || !latestWeatherAssessment) return null;

    const snapshot = {
      precipitation: latestWeatherRisk.precipitation,
      temperature: latestWeatherRisk.temperature,
      wind: latestWeatherRisk.wind,
      humidity: latestWeatherRisk.humidity,
    };

    return {
      ...snapshot,
      score: latestWeatherAssessment.score,
      summary: latestWeatherRisk.summary ?? latestWeatherAssessment.summary,
      collectedAt: latestWeatherRisk.collected_at ?? latestWeatherRisk.forecast_at,
    };
  }, [latestWeatherAssessment, latestWeatherRisk]);

  const generationKey = useMemo(
    () => ({
      weather: latestWeatherRisk?.id ?? "none",
      pest: pestRisks.map((risk) => `${risk.id}:${risk.score}`).join("|"),
      work: workSchedules
        .map((item) => `${item.sourceId}:${item.eras.map((era) => [
          era.operationName,
          era.farmWorkFlag ?? "",
          era.beginMonth ?? "",
          era.beginEra ?? "",
          era.endMonth ?? "",
          era.endEra ?? "",
          era.videoUrl ?? "",
        ].join("-")).join(",")}`)
        .join("|"),
      weekly: weeklyInfos
        .map((item) => `${item.sourceKey}:${item.periodStart ?? ""}:${item.periodEnd ?? ""}`)
        .join("|"),
      briefing: activeWeeklyBriefing
        ? `${activeWeeklyBriefing.contextKey}:${activeWeeklyBriefing.actionBullets.join("|")}`
        : "none",
    }),
    [activeWeeklyBriefing, latestWeatherRisk?.id, pestRisks, weeklyInfos, workSchedules],
  );

  const canGenerateTasks =
    !!selected &&
    !weatherLoading &&
    !pestLoading &&
    !weeklyLoading &&
    !workScheduleLoading &&
    !weeklyBriefingLoading;

  const weeklyBriefingBadgeLabel =
    !weeklyBriefingShouldLoad
      ? "요약 대기"
      : weeklyBriefingLoading
        ? "요약 중"
        : activeWeeklyBriefing?.cacheStatus === "stale"
      ? "이전 요약"
      : activeWeeklyBriefing?.cacheStatus === "cached"
        ? "저장 요약"
        : activeWeeklyBriefing?.errorCode === "unsupported_weekly_document"
          ? "AI 참고"
        : activeWeeklyBriefing?.cacheStatus === "unavailable"
          ? "요약 지연"
          : activeWeeklyBriefing && !activeWeeklyBriefing.relevant
            ? "AI 참고"
          : "Gemini";

  const requestWeeklyBriefingSummary = useCallback(() => {
    if (!latestWeeklyBriefingKey) return;
    forceNextWeeklyBriefingRefreshRef.current = true;
    setRequestedWeeklyBriefingKey(latestWeeklyBriefingKey);
    setManualWeeklyBriefingRefreshNonce((nonce) => nonce + 1);
  }, [latestWeeklyBriefingKey]);

  useEffect(() => {
    const newCurrentInfo = weeklyInfos.find((item) => item.isCurrent && item.isNew && item.sourceKey);
    if (!newCurrentInfo) return;

    const storageKey = getWeeklyInfoNotificationKey(newCurrentInfo.sourceKey);
    if (window.localStorage.getItem(storageKey)) return;

    window.localStorage.setItem(storageKey, "1");
    toast.info("새 주간농사정보가 등록되었습니다.", {
      description: `${newCurrentInfo.title} · ${formatWeeklyInfoPeriod(newCurrentInfo)}`,
      action: {
        label: "요약",
        onClick: requestWeeklyBriefingSummary,
      },
    });
  }, [requestWeeklyBriefingSummary, weeklyInfos]);

  const {
    data: generatedTasks = [],
    isFetching: generationLoading,
    isError: generationError,
  } = useQuery({
    queryKey: ["task-card-generation", selected?.id, generationKey],
    enabled: canGenerateTasks,
    queryFn: () =>
      generateAndSaveTaskCardsForField({
        fieldId: selected!.id,
        cropName: selected!.crop_name,
        weatherRisk: weatherTaskRisk,
        pestRisks: pestRisks.map((risk) => ({
          candidateName: risk.candidate_name,
          score: risk.score,
          reasons: risk.reasons,
          officialSources: risk.official_sources,
          createdAt: risk.created_at,
        })),
        workSchedules,
        weeklyInfos,
        briefing: activeWeeklyBriefing,
        includeWorkScheduleTasks: false,
      }),
    staleTime: TASK_STALE_MS,
    retry: 1,
  });

  useEffect(() => {
    if (!selected?.id || generatedTasks.length === 0) return;
    void qc.invalidateQueries({ queryKey: ["task-cards", selected.id] });
    void qc.invalidateQueries({ queryKey: ["tasks", selected.id] });
  }, [generatedTasks.length, qc, selected?.id]);

  useEffect(() => {
    if (!selected?.crop_name || activeWeeklyBriefing?.cacheStatus !== "fresh") return;
    void qc.invalidateQueries({ queryKey: ["tasks-weekly", selected.crop_name] });
  }, [activeWeeklyBriefing?.cacheStatus, qc, selected?.crop_name]);

  const pending = tasks.filter((task) => task.status === "pending");
  const visiblePending = pending.filter((task) => !taskSourceKinds(task).includes("농작업일정"));
  const actionableTasks = [...visiblePending].sort((left, right) => dueTime(left) - dueTime(right));
  const currentMonthScheduleEraCount = workSchedules.reduce(
    (count, schedule) => count + schedule.eras.filter((era) => isEraInMonth(era, currentSchedulePeriod.month)).length,
    0,
  );
  const workScheduleStatusLabel = workScheduleLookupStatusLabel(
    workScheduleLookup,
    selected?.crop_name ?? "",
    currentMonthScheduleEraCount,
  );
  const hasWeeklyTask = actionableTasks.some((task) => taskSourceKinds(task).includes("주간농사정보"));
  const activeBriefingWeatherBullets = activeWeeklyBriefing?.weatherBullets ?? [];
  const activeBriefingPestRiskBullets = activeWeeklyBriefing?.pestRiskBullets ?? [];
  const activeBriefingIrrigationBullets = activeWeeklyBriefing?.irrigationBullets ?? [];
  const activeBriefingGrowthBullets = activeWeeklyBriefing?.growthManagementBullets ?? [];
  const activeWeeklyBriefingIsUnsupportedDocument =
    activeWeeklyBriefing?.errorCode === "unsupported_weekly_document";
  const shouldLoadAlternativeBriefing =
    !!activeWeeklyBriefing &&
    (!activeWeeklyBriefing.relevant || activeWeeklyBriefingIsUnsupportedDocument) &&
    (activeWeeklyBriefing.cacheStatus !== "unavailable" || activeWeeklyBriefingIsUnsupportedDocument);
  const {
    data: alternativeBriefing = null,
    isFetching: alternativeBriefingLoading,
    isError: alternativeBriefingError,
  } = useQuery({
    queryKey: [
      "weekly-farm-ai-knowledge-briefing",
      selected?.crop_name,
      selected?.id,
      activeWeeklyBriefing?.contextKey,
      activeWeeklyBriefing?.fetchedAt,
      weeklyBriefingWeatherIncidentKey,
    ],
    enabled:
      !!selected?.crop_name &&
      shouldLoadAlternativeBriefing,
    queryFn: ({ signal }) =>
      generateWeeklyFarmAlternativeBriefing({
        cropName: selected!.crop_name,
        field: weeklyBriefingFieldContext,
        weather: weeklyBriefingWeatherContext,
        signal,
      }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  async function invalidateTaskQueries(fieldId: string) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["task-cards", fieldId] }),
      qc.invalidateQueries({ queryKey: ["tasks", fieldId] }),
    ]);
  }

  async function saveChecks(task: TaskCard, checks: TaskCheck[]) {
    try {
      await updateTaskChecks(task.id, checks);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업 체크리스트를 저장하지 못했습니다.");
    }
  }

  async function complete(task: TaskCard, checks: TaskCheck[]) {
    try {
      await markTaskDone(task.id, checks);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업 상태를 변경하지 못했습니다.");
      return;
    }

    if (selected?.id) await invalidateTaskQueries(selected.id);
    toast.success(`완료: ${task.title}`, {
      action: {
        label: "취소",
        onClick: async () => {
          await reopenTask(task.id);
          if (selected?.id) await invalidateTaskQueries(selected.id);
        },
      },
      duration: 10000,
    });
  }

  if (!selected) {
    return <p className="text-sm text-muted-foreground">등록된 필지를 먼저 선택해야 작업 카드를 생성할 수 있습니다.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">해야 할 작업</h1>
          <p className="text-xs text-muted-foreground">{actionableTasks.length}개 대기 중</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {generationLoading && "작업 카드 갱신 중"}
          {generationError && "작업 카드 자동 생성 실패"}
          {!generationLoading && !generationError && "공식 데이터 기반 자동 생성"}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2" aria-label="해야 할 작업">
        {taskLoading && <p className="text-sm text-muted-foreground">작업 카드를 불러오는 중입니다.</p>}
        {actionableTasks.map((task) => (
          <TaskCardView key={task.id} task={task} onChecksChange={saveChecks} onComplete={complete} />
        ))}
        {!taskLoading && actionableTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">해야 할 작업 카드가 없습니다.</p>
        )}
      </section>

      <Card>
        <CardContent className="space-y-6 p-4">
            <section className="space-y-3" aria-labelledby="work-schedule-title">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-secondary" aria-hidden="true" />
                <h2 id="work-schedule-title" className="text-sm font-semibold">
                  이번 달 농작업일정
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {workScheduleError && <Badge variant="destructive">농작업일정 API 조회 실패</Badge>}
                {!workScheduleLoading && !workScheduleError && workScheduleStatusLabel && (
                  <Badge
                    variant={workScheduleStatusBadgeVariant(workScheduleLookup, currentMonthScheduleEraCount)}
                    className="text-[11px]"
                  >
                    {workScheduleStatusLabel}
                  </Badge>
                )}
                {hasWeeklyTask && (
                  <Badge variant="outline" className="text-[11px]">
                    주간농사정보 기반 작업카드 생성됨
                  </Badge>
                )}
              </div>
              {workScheduleLoading && <p className="text-sm text-muted-foreground">농작업일정 정보를 조회하는 중입니다.</p>}
              {workScheduleError && (
                <p className="text-sm text-destructive">농작업일정 정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
              )}
              {!workScheduleLoading && !workScheduleError && workSchedules.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {workScheduleLookup?.status === "schedule-match-failed"
                    ? `${selected.crop_name} 일정 제목을 농작업일정 공식 목록에서 찾지 못했습니다.`
                    : "선택 작물과 일치하는 농작업일정 공식 자료가 없습니다."}
                </p>
              )}
              {!workScheduleLoading && !workScheduleError && workSchedules.slice(0, 3).map((item) => {
                const currentMonthEras = item.eras.filter((era) => isEraInMonth(era, currentSchedulePeriod.month));
                const scheduleGroups = groupScheduleEras(currentMonthEras);
                const detailPreview = formatDetailPreview(item.detailText);
                return (
                  <div key={item.sourceId} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{item.cropName}</Badge>
                          <div className="font-medium">{item.title}</div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          농사로 농작업일정 API 기준 · KST 현재 월({currentSchedulePeriod.month}월)
                        </p>
                      </div>
                      {currentMonthEras.length > 0 && (
                        <Badge variant="secondary" className="shrink-0 text-[11px]">
                          {currentSchedulePeriod.month}월 {currentMonthEras.length}개
                        </Badge>
                      )}
                    </div>

                    {scheduleGroups.length > 0 ? (
                      <div className="mt-3 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-secondary">
                            이번 달({currentSchedulePeriod.month}월) 해당 항목
                          </span>
                          <Badge variant="outline" className="text-[11px]">
                            {currentSchedulePeriod.month}월
                          </Badge>
                        </div>
                        {scheduleGroups.map((group) => (
                          <div key={`${item.sourceId}-${group.label}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-foreground">{group.label}</div>
                              <div className="text-[11px] text-muted-foreground">{group.eras.length}개</div>
                            </div>
                            <div className="mt-2 overflow-hidden rounded-md border">
                              {group.eras.map((era, index) => {
                                const meta = formatEraMeta(era, item.title);
                                const active = isNongsaroScheduleEraInPeriods(era, [currentSchedulePeriod]);
                                const lines = operationNameLines(era.operationName);
                                const checklist = eraChecklist(era, group.label);
                                return (
                                  <div
                                    key={`${item.sourceId}-${group.label}-${index}`}
                                    className={`grid gap-2 p-2.5 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)] ${
                                      index > 0 ? "border-t" : ""
                                    } ${active ? "bg-secondary/5" : "bg-background"}`}
                                  >
                                    <div className="text-xs font-medium text-muted-foreground">
                                      {formatEraPeriod(era)}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="break-words font-medium leading-snug">
                                        {lines.map((line, lineIndex) => (
                                          <div key={`${item.sourceId}-${group.label}-${index}-line-${lineIndex}`}>
                                            {line}
                                          </div>
                                        ))}
                                      </div>
                                      {active && (
                                        <Badge variant="outline" className="mt-1 h-5 px-1.5 text-[10px]">
                                          현재 시기
                                        </Badge>
                                      )}
                                      {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
                                      <div className="mt-2">
                                        <div className="text-[11px] font-medium text-muted-foreground">확인할 일</div>
                                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                          {checklist.map((check) => (
                                            <li key={`${item.sourceId}-${group.label}-${index}-${check}`}>
                                              {check}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <WorkScheduleVideoRecommendations
                                        fieldId={selected.id}
                                        cropName={selected.crop_name}
                                        scheduleSourceId={item.sourceId}
                                        workItem={era.operationName}
                                        infoType={era.infoType}
                                        periodLabel={formatEraPeriod(era)}
                                        scheduleMonth={currentSchedulePeriod.month}
                                        farmWorkFlag={era.farmWorkFlag}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {currentSchedulePeriod.month}월에 해당하는 농작업일정이 없습니다.
                      </p>
                    )}

                    {currentMonthEras.length === 0 && detailPreview && (
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        {detailPreview}
                      </p>
                    )}

                    {item.fileUrl && (
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                      >
                        첨부 자료 확인 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-3 border-t pt-4" aria-labelledby="weekly-farm-title">
              <div className="space-y-3 rounded-md border bg-muted/30 p-3" aria-labelledby="weekly-briefing-title">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-secondary" aria-hidden="true" />
                    <h2 id="weekly-briefing-title" className="text-sm font-semibold">
                      이번 주 농사 브리핑
                    </h2>
                    <Badge variant="outline" className="text-[11px]">
                      {weeklyBriefingBadgeLabel}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="이번주 주간농사정보 파일 요약"
                    disabled={!latestWeeklyBriefingSourceUrl || weeklyBriefingLoading}
                    onClick={requestWeeklyBriefingSummary}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {weeklyBriefingLoading ? "요약 중" : "요약"}
                  </Button>
                </div>
                {weeklyBriefingLoading && (
                  <p className="text-sm text-muted-foreground">
                    {latestWeeklyPdfSourceUrl
                      ? "주간농사정보 PDF를 읽고 요약하는 중입니다."
                      : "주간농사정보 자료 형식을 확인하고 AI 참고 브리핑을 준비하는 중입니다."}
                  </p>
                )}
                {weeklyBriefingShouldLoad && weeklyBriefingError && (
                  <p className="text-sm text-muted-foreground">
                    주간농사정보 브리핑을 만들지 못했습니다. 원문 자료를 확인하세요.
                  </p>
                )}
                {!weeklyBriefingLoading && !weeklyBriefingError && !latestWeeklyBriefingSourceUrl && (
                  <p className="text-sm text-muted-foreground">요약할 주간농사정보 자료 링크가 없습니다.</p>
                )}
                {!weeklyBriefingLoading &&
                  !weeklyBriefingError &&
                  latestWeeklyBriefingSourceUrl &&
                  !latestWeeklyPdfSourceUrl &&
                  !weeklyBriefingShouldLoad && (
                  <p className="text-sm text-muted-foreground">
                    현재 자료는 PDF가 아니므로 원문 분석 대신 AI 참고 브리핑을 생성합니다.
                  </p>
                )}
                {!weeklyBriefingShouldLoad && latestWeeklyPdfSourceUrl && (
                  <p className="text-sm text-muted-foreground">아직 생성된 브리핑이 없습니다.</p>
                )}
                {activeWeeklyBriefing && (
                  <div className="space-y-3">
                    {activeWeeklyBriefing.cacheStatus === "stale" && (
                      <p className="text-sm text-muted-foreground">
                        최신 AI 요약 생성이 지연되어 이전 성공 요약을 표시합니다.
                      </p>
                    )}
                    {activeWeeklyBriefing.cacheStatus === "unavailable" && (
                      <p className="text-sm text-muted-foreground">
                        {activeWeeklyBriefingIsUnsupportedDocument
                          ? "현재 자료가 PDF 형식이 아니어서 원문 분석 대신 AI 참고 브리핑을 표시합니다."
                          : "AI 요약 생성이 지연되어 원문 자료 확인이 필요합니다."}
                      </p>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{activeWeeklyBriefing.cropName}</Badge>
                        {activeWeeklyBriefing.cropGroup && <Badge variant="outline">{activeWeeklyBriefing.cropGroup}</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {activeWeeklyBriefing.sourceTitle}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{activeWeeklyBriefing.headline}</p>
                      {!activeWeeklyBriefing.relevant && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activeWeeklyBriefingIsUnsupportedDocument
                            ? "공식 PDF 근거가 없어 AI 참고로만 표시합니다."
                            : "선택 작물과 직접 관련된 내용이 원문에서 확인되지 않았습니다."}
                        </p>
                      )}
                    </div>
                    {shouldLoadAlternativeBriefing && alternativeBriefingLoading && (
                      <p className="text-sm text-muted-foreground">
                        공식 주간농사정보 근거가 없어 AI 참고 브리핑을 생성하는 중입니다.
                      </p>
                    )}
                    {shouldLoadAlternativeBriefing && alternativeBriefingError && (
                      <p className="text-sm text-muted-foreground">
                        AI 참고 브리핑을 생성하지 못했습니다. 원문 자료와 현장 상태를 직접 확인하세요.
                      </p>
                    )}
                    {alternativeBriefing && (
                      <div className="space-y-3 rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[11px]">AI 참고</Badge>
                          <span className="text-xs text-muted-foreground">
                            공식 주간농사정보 근거 없음 · AI 내부 지식 기반
                          </span>
                        </div>
                        <p className="text-sm font-medium">{alternativeBriefing.headline}</p>
                        {alternativeBriefing.summaryBullets.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">AI 참고 요약</div>
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {alternativeBriefing.summaryBullets.map((item, index) => (
                                <li key={`weekly-alternative-summary-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {alternativeBriefing.actionBullets.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">AI 참고 확인할 일</div>
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {alternativeBriefing.actionBullets.map((item, index) => (
                                <li key={`weekly-alternative-action-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {alternativeBriefing.cautionBullets.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">AI 참고 주의사항</div>
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                              {alternativeBriefing.cautionBullets.map((item, index) => (
                                <li key={`weekly-alternative-caution-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {alternativeBriefing.evidenceSources.length > 0 && (
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <ChevronDown className="h-3 w-3" aria-hidden="true" /> 참고 기준 보기
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                              {alternativeBriefing.evidenceSources.map((source, index) => (
                                <div key={`weekly-alternative-source-${index}`}>
                                  {source.url ? (
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-secondary hover:underline"
                                    >
                                      {source.name} <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span>{source.name}</span>
                                  )}
                                </div>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                    {(activeWeeklyBriefing.fieldContext || activeWeeklyBriefing.weatherContext) && (
                      <div className="grid gap-2 rounded-md bg-background p-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
                        {activeWeeklyBriefing.fieldContext && (
                          <div>
                            <div className="font-medium text-foreground">
                              {activeWeeklyBriefing.fieldContext.name ?? "선택 필지"}
                            </div>
                            <div className="mt-1 break-words">
                              {activeWeeklyBriefing.fieldContext.address ?? "주소 정보 없음"}
                              {activeWeeklyBriefing.fieldContext.growthStage
                                ? ` · ${activeWeeklyBriefing.fieldContext.growthStage}`
                                : ""}
                            </div>
                          </div>
                        )}
                        {activeWeeklyBriefing.weatherContext && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>강수 {formatWeatherValue(activeWeeklyBriefing.weatherContext.precipitation, "mm")}</div>
                            <div>기온 {formatWeatherValue(activeWeeklyBriefing.weatherContext.temperature, "℃")}</div>
                            <div>풍속 {formatWeatherValue(activeWeeklyBriefing.weatherContext.wind, "m/s")}</div>
                            <div>습도 {formatWeatherValue(activeWeeklyBriefing.weatherContext.humidity, "%")}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {activeWeeklyBriefing.summaryBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">핵심 요약</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeWeeklyBriefing.summaryBullets.map((item, index) => (
                            <li key={`weekly-summary-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeBriefingWeatherBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">기상 반영</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeBriefingWeatherBullets.map((item, index) => (
                            <li key={`weekly-weather-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeBriefingPestRiskBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">병해충 가능성</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeBriefingPestRiskBullets.map((item, index) => (
                            <li key={`weekly-pest-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeBriefingIrrigationBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">관수 판단</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeBriefingIrrigationBullets.map((item, index) => (
                            <li key={`weekly-irrigation-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeBriefingGrowthBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">생육 관리</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeBriefingGrowthBullets.map((item, index) => (
                            <li key={`weekly-growth-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeWeeklyBriefing.actionBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">확인할 일</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeWeeklyBriefing.actionBullets.map((item, index) => (
                            <li key={`weekly-action-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeWeeklyBriefing.cautionBullets.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">주의사항</div>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {activeWeeklyBriefing.cautionBullets.map((item, index) => (
                            <li key={`weekly-caution-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {activeWeeklyBriefing.evidenceSnippets.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-3 w-3" aria-hidden="true" /> 원문 근거 보기
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-1 rounded-md bg-background p-2 text-xs text-muted-foreground">
                          {activeWeeklyBriefing.evidenceSnippets.map((item, index) => (
                            <div key={`weekly-evidence-${index}`}>{item}</div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    <a
                      href={activeWeeklyBriefing.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                    >
                      {activeWeeklyBriefing.sourceUrl.toLowerCase().includes(".pdf") ? "원문 PDF 확인" : "원문 자료 확인"} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-secondary" aria-hidden="true" />
                <h2 id="weekly-farm-title" className="text-sm font-semibold">
                  주간농사정보 근거 (이번 주)
                </h2>
              </div>
              {weeklyLoading && <p className="text-sm text-muted-foreground">주간농사정보를 조회하는 중입니다.</p>}
              {!weeklyLoading && currentWeeklyInfos.length === 0 && (
                <p className="text-sm text-muted-foreground">현재 주간 기간에 해당하는 공식 자료가 없습니다.</p>
              )}
              {!weeklyLoading && currentWeeklyInfos.map((item) => {
                const pdfSourceUrl = getWeeklyFarmBriefingPdfSourceUrl(item);
                const sourceUrl = pdfSourceUrl ?? item.sourceUrl;

                return (
                  <div key={item.sourceKey} className="rounded-md border p-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatWeeklyInfoPeriod(item)}
                      {item.publishedAt ? ` · 등록 ${item.publishedAt}` : ""}
                      {item.writer ? ` · ${item.writer}` : ""}
                    </div>
                    {sourceUrl && (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                      >
                        {pdfSourceUrl ? "PDF 자료 확인" : "공식 자료 확인"} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </section>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkScheduleVideoRecommendations({
  fieldId,
  cropName,
  scheduleSourceId,
  workItem,
  infoType,
  periodLabel,
  scheduleMonth,
  farmWorkFlag,
}: {
  fieldId: string;
  cropName: string;
  scheduleSourceId: string;
  workItem: string;
  infoType: string | null;
  periodLabel: string;
  scheduleMonth: number;
  farmWorkFlag: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    data: recommendations = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: [
      "nongsaro-work-video-recommendations",
      fieldId,
      cropName,
      scheduleSourceId,
      workItem,
      infoType,
      periodLabel,
      scheduleMonth,
      farmWorkFlag,
    ],
    enabled: Boolean(fieldId && cropName && workItem && scheduleMonth),
    queryFn: ({ signal }) =>
      getWorkVideoRecommendationsForEra({
        fieldId,
        cropName,
        scheduleSourceId,
        workItem,
        infoType,
        periodLabel,
        scheduleMonth,
        farmWorkFlag,
        forceRefresh: false,
        signal,
      }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const visibleRecommendations = useMemo(
    () => filterVisibleWorkVideoRecommendations(recommendations),
    [recommendations],
  );
  const limitedRecommendations = useMemo(
    () => visibleRecommendations.slice(0, 3),
    [visibleRecommendations],
  );
  const displayedRecommendations = expanded ? limitedRecommendations : limitedRecommendations.slice(0, 1);
  const hasMoreRecommendations = limitedRecommendations.length > 1;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-secondary">도움되는 동영상</div>
      </div>

      {isError && (
        <p className="text-xs text-muted-foreground">관련 동영상 판정을 완료하지 못했습니다.</p>
      )}

      {isFetching && recommendations.length === 0 && !isError && (
        <p className="text-xs text-muted-foreground">관련 동영상을 판정하는 중입니다.</p>
      )}

      {!isFetching && !isError && limitedRecommendations.length === 0 && (
        <p className="text-xs text-muted-foreground">
          현재 작업과 직접 관련된 동영상은 확인되지 않았습니다.
        </p>
      )}

      {limitedRecommendations.length > 0 && (
        <div className="space-y-2">
          {displayedRecommendations.map((video) => (
            <div
              key={`${workItem}-${video.videoLink}`}
              className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]"
            >
              <div className="aspect-video overflow-hidden rounded bg-muted">
                {video.videoImg ? (
                  <img
                    src={video.videoImg}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    썸네일 없음
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={video.matchType === "direct" ? "secondary" : "outline"} className="text-[10px]">
                    {videoMatchTypeLabel(video.matchType)} {video.matchScore}점
                  </Badge>
                  {video.videoOriginInstt && (
                    <span className="text-[11px] text-muted-foreground">{video.videoOriginInstt}</span>
                  )}
                </div>
                <div className="break-words text-xs font-medium leading-snug">{video.videoTitle}</div>
                <p className="text-xs text-muted-foreground">{video.reason}</p>
                <a
                  href={video.videoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                >
                  영상 보기 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
          {hasMoreRecommendations && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "접기" : "더 보기"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCardView({
  task,
  onChecksChange,
  onComplete,
  readOnly,
}: {
  task: TaskCard;
  onChecksChange: (task: TaskCard, checks: TaskCheck[]) => void | Promise<void>;
  onComplete: (task: TaskCard, checks: TaskCheck[]) => void | Promise<void>;
  readOnly?: boolean;
}) {
  const [checks, setChecks] = useState<TaskCheck[]>(task.checks ?? []);
  const checkedCount = checks.filter((check) => check.done).length;
  const canComplete = checks.length === 0 || checkedCount === checks.length;
  const sourceKinds = taskSourceKinds(task);

  useEffect(() => {
    setChecks(task.checks ?? []);
  }, [task.id, task.checks]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatDueAt(task)}</Badge>
              {sourceKinds.map((kind) => (
                <Badge key={`${task.id}-${kind}`} variant="outline" className="text-[11px]">
                  {kind}
                </Badge>
              ))}
            </div>
            <div className="font-medium leading-snug">{task.title}</div>
          </div>
          <div className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {task.duration_min ?? 0}분
          </div>
        </div>

        {task.reason && <p className="text-sm text-muted-foreground">{task.reason}</p>}

        <div className="space-y-1.5">
          {checks.map((check, index) => (
            <label key={`${task.id}-check-${index}`} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={check.done}
                disabled={readOnly}
                onCheckedChange={(value) => {
                  const next = checks.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, done: !!value } : item,
                  );
                  setChecks(next);
                  void onChecksChange(task, next);
                }}
              />
              <span className={check.done ? "line-through text-muted-foreground" : ""}>{check.label}</span>
            </label>
          ))}
        </div>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3 w-3" aria-hidden="true" /> 근거 데이터 보기
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
            {task.sources?.map((source, index) => (
              <div key={`${task.id}-source-${index}`} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {sourceKind(source)}
                </Badge>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-secondary hover:underline"
                  >
                    {source.name} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span>{source.name}</span>
                )}
                {source.collectedAt && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {new Date(source.collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                  </span>
                )}
              </div>
            ))}
            {(!task.sources || task.sources.length === 0) && (
              <div className="text-muted-foreground">근거 데이터가 없습니다.</div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {!readOnly && (
          <Button
            className="w-full"
            disabled={!canComplete}
            onClick={() => onComplete(task, checks)}
          >
            완료 처리 ({checkedCount}/{checks.length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
