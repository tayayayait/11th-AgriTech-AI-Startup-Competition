import type { KmaWeatherSnapshot } from "@/domain/weather/kma";
import { normalizeHtmlSingleLineText } from "@/domain/text/html";

export interface TaskEngineWeatherRisk extends KmaWeatherSnapshot {
  score: number;
  summary: string | null;
  collectedAt?: string | null;
}

export interface TaskEnginePestRisk {
  candidateName: string;
  score: number;
  reasons: string[];
  officialSources: string[];
  createdAt?: string | null;
  ncpmsDetail?: {
    symptoms: string;
    prevention: string;
    environment: string;
  } | null;
}

export interface TaskEngineWorkScheduleEra {
  operationName: string;
  farmWorkFlag: string | null;
  beginMonth: number | null;
  endMonth: number | null;
  beginEra: string | null;
  endEra: string | null;
  requiredMonth: number | null;
  infoType: string | null;
  videoUrl: string | null;
}

export interface NongsaroScheduleEraRange {
  beginMonth: number | null;
  endMonth: number | null;
  beginEra: string | null;
  endEra: string | null;
}

export interface TaskEngineWorkSchedule {
  sourceId: string;
  title: string;
  cropName: string;
  detailText: string | null;
  fileUrl: string | null;
  eras: TaskEngineWorkScheduleEra[];
}

export interface TaskEngineWeeklyInfo {
  title: string;
  publishedAt: string | null;
  sourceUrl: string | null;
}

export interface TaskEngineBriefing {
  actionBullets: string[];
  cautionBullets: string[];
  headline: string;
  sourceTitle: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface TaskCardDraftCheck {
  label: string;
  done: boolean;
}

export interface TaskCardDraftSource {
  name: string;
  collectedAt?: string;
  url?: string;
}

export interface TaskCardDraft {
  priority: number;
  title: string;
  reason: string;
  checks: TaskCardDraftCheck[];
  durationMin: number;
  sources: TaskCardDraftSource[];
  dueInDays: number;
  detailText?: string | null;
}

export interface BuildTaskCardDraftsInput {
  cropName: string;
  today?: Date;
  weatherRisk: TaskEngineWeatherRisk | null;
  pestRisks: TaskEnginePestRisk[];
  workSchedules: TaskEngineWorkSchedule[];
  weeklyInfos: TaskEngineWeeklyInfo[];
  briefing?: TaskEngineBriefing | null;
  includeWorkScheduleTasks?: boolean;
}

const check = (label: string): TaskCardDraftCheck => ({ label, done: false });

const weatherSource = (weatherRisk: TaskEngineWeatherRisk): TaskCardDraftSource => ({
  name: "KMA 날씨 위험도",
  collectedAt: weatherRisk.collectedAt ?? undefined,
});

const addUniqueTask = (tasks: TaskCardDraft[], task: TaskCardDraft): void => {
  if (!tasks.some((item) => item.title === task.title)) {
    tasks.push(task);
  }
};

const buildWeatherTasks = (weatherRisk: TaskEngineWeatherRisk | null): TaskCardDraft[] => {
  if (!weatherRisk) return [];

  const tasks: TaskCardDraft[] = [];
  const source = weatherSource(weatherRisk);

  if (weatherRisk.precipitation !== null && weatherRisk.precipitation >= 20) {
    addUniqueTask(tasks, {
      priority: weatherRisk.score >= 70 ? 1 : 2,
      title: "강수 후 배수로·포장 상태 점검",
      reason: `강수 ${weatherRisk.precipitation}mm 예보/관측으로 침수와 병 발생 가능성 확인 필요`,
      checks: [check("배수로 막힘 확인"), check("침수·고인 물 위치 기록"), check("잎·줄기 병반 확인")],
      durationMin: 30,
      sources: [source],
      dueInDays: 0,
    });
  }

  if (weatherRisk.humidity !== null && weatherRisk.humidity >= 80) {
    addUniqueTask(tasks, {
      priority: weatherRisk.humidity >= 90 ? 2 : 3,
      title: "고습 병 발생 징후 확인",
      reason: `습도 ${weatherRisk.humidity}% 조건으로 잎마름·곰팡이성 병 확인 필요`,
      checks: [check("잎 뒷면과 줄기 하단 확인"), check("밀식·통풍 불량 구역 표시"), check("이상 부위 사진 기록")],
      durationMin: 25,
      sources: [source],
      dueInDays: 0,
    });
  }

  if (weatherRisk.wind !== null && weatherRisk.wind >= 9) {
    addUniqueTask(tasks, {
      priority: 2,
      title: "강풍 후 지주·작물 손상 점검",
      reason: `풍속 ${weatherRisk.wind}m/s 조건으로 작물 손상과 2차 병해 확인 필요`,
      checks: [check("지주·끈 고정 상태 확인"), check("찢어진 잎·상처 부위 확인"), check("낙과·쓰러짐 구역 기록")],
      durationMin: 30,
      sources: [source],
      dueInDays: 0,
    });
  }

  if (weatherRisk.temperature !== null && weatherRisk.temperature >= 33) {
    addUniqueTask(tasks, {
      priority: 2,
      title: "고온 스트레스 완화 점검",
      reason: `기온 ${weatherRisk.temperature}도 조건으로 관수와 차광 필요 여부 확인`,
      checks: [check("토양 수분 확인"), check("시듦 증상 구역 확인"), check("차광·관수 필요 여부 판단")],
      durationMin: 25,
      sources: [source],
      dueInDays: 0,
    });
  }

  if (weatherRisk.temperature !== null && weatherRisk.temperature <= 0) {
    addUniqueTask(tasks, {
      priority: 2,
      title: "저온 피해 예방 점검",
      reason: `기온 ${weatherRisk.temperature}도 조건으로 냉해 피해 가능성 확인 필요`,
      checks: [check("보온 자재 상태 확인"), check("잎 끝 갈변 여부 확인"), check("배수와 피복 상태 확인")],
      durationMin: 25,
      sources: [source],
      dueInDays: 0,
    });
  }

  return tasks;
};

const buildPestTask = (pestRisks: TaskEnginePestRisk[]): TaskCardDraft[] => {
  const topRisk = [...pestRisks].sort((a, b) => b.score - a.score)[0];
  if (!topRisk || topRisk.score <= 0) return [];

  let checks = [check("공식 발생정보 원문 확인"), check("잎 뒷면·줄기·생장점 확인"), check("발견 위치와 사진 기록")];

  if (topRisk.ncpmsDetail) {
    const dynamicChecks: TaskCardDraftCheck[] = [];
    if (topRisk.ncpmsDetail.symptoms) {
      const text = topRisk.ncpmsDetail.symptoms.split(/[.!?\n]/)[0].slice(0, 40).trim();
      if (text) dynamicChecks.push(check(`증상 확인: ${text}`));
    }
    if (topRisk.ncpmsDetail.environment) {
      const text = topRisk.ncpmsDetail.environment.split(/[.!?\n]/)[0].slice(0, 40).trim();
      if (text) dynamicChecks.push(check(`발생환경 점검: ${text}`));
    }
    if (topRisk.ncpmsDetail.prevention) {
      const text = topRisk.ncpmsDetail.prevention.split(/[.!?\n]/)[0].slice(0, 40).trim();
      if (text) dynamicChecks.push(check(`방제 조치: ${text}`));
    }
    
    if (dynamicChecks.length > 0) {
      checks = dynamicChecks;
    }
  }

  return [
    {
      priority: topRisk.score >= 70 ? 1 : 2,
      title: "병해충 위험 예보 근거 확인",
      reason: topRisk.reasons[0] ?? `${topRisk.candidateName} 확인 필요`,
      checks,
      durationMin: 25,
      sources: [
        {
          name: topRisk.candidateName,
          collectedAt: topRisk.createdAt ?? undefined,
        },
        ...topRisk.officialSources.slice(0, 3).map((name) => ({ name })),
      ],
      dueInDays: 0,
    },
  ];
};

const normalizeMatchText = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

export type NongsaroScheduleEraSegment = "상" | "중" | "하";

export interface NongsaroSchedulePeriod {
  month: number;
  era: NongsaroScheduleEraSegment;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getKstMonthDay = (date: Date): { month: number; day: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? date.getMonth() + 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? date.getDate()),
  };
};

export const getKstDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value ?? String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isTaskDueToday = (dueAt: string | null, today = new Date()): boolean => {
  if (!dueAt) return true;
  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) return true;
  return getKstDateKey(dueDate) === getKstDateKey(today);
};

export const splitTasksByDueDate = <T extends { due_at: string | null }>(
  tasks: T[],
  today = new Date(),
): { today: T[]; upcoming: T[] } => ({
  today: tasks.filter((task) => isTaskDueToday(task.due_at, today)),
  upcoming: tasks.filter((task) => !isTaskDueToday(task.due_at, today)),
});

export const getNongsaroSchedulePeriod = (date: Date): NongsaroSchedulePeriod => {
  const { month, day } = getKstMonthDay(date);
  const era: NongsaroScheduleEraSegment = day <= 10 ? "상" : day <= 20 ? "중" : "하";

  return {
    month,
    era,
  };
};

const sameSchedulePeriod = (a: NongsaroSchedulePeriod, b: NongsaroSchedulePeriod): boolean =>
  a.month === b.month && a.era === b.era;

export const getNongsaroScheduleWeekPeriods = (date: Date, days = 7): NongsaroSchedulePeriod[] => {
  const periods: NongsaroSchedulePeriod[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const period = getNongsaroSchedulePeriod(new Date(date.getTime() + offset * MS_PER_DAY));
    if (!periods.some((item) => sameSchedulePeriod(item, period))) {
      periods.push(period);
    }
  }

  return periods;
};

const eraOrder: Record<NongsaroScheduleEraSegment, number> = {
  상: 0,
  중: 1,
  하: 2,
};

const normalizeEraSegment = (value: string | null): NongsaroScheduleEraSegment | null => {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("상") || text.includes("upper")) return "상";
  if (text.includes("중") || text.includes("middle") || text === "mid") return "중";
  if (text.includes("하") || text.includes("lower")) return "하";
  return null;
};

const periodIndex = (period: NongsaroSchedulePeriod): number =>
  (period.month - 1) * 3 + eraOrder[period.era];

const eraStartPeriod = (era: NongsaroScheduleEraRange): NongsaroSchedulePeriod | null => {
  const month = era.beginMonth ?? era.endMonth;
  if (month === null) return null;

  return {
    month,
    era: normalizeEraSegment(era.beginEra) ?? "상",
  };
};

const eraEndPeriod = (era: NongsaroScheduleEraRange): NongsaroSchedulePeriod | null => {
  const month = era.endMonth ?? era.beginMonth;
  if (month === null) return null;

  return {
    month,
    era: normalizeEraSegment(era.endEra) ?? "하",
  };
};

const isPeriodInEraRange = (period: NongsaroSchedulePeriod, era: NongsaroScheduleEraRange): boolean => {
  const start = eraStartPeriod(era);
  const end = eraEndPeriod(era);
  if (!start || !end) return false;

  const currentIndex = periodIndex(period);
  const startIndex = periodIndex(start);
  const endIndex = periodIndex(end);

  if (startIndex <= endIndex) {
    return currentIndex >= startIndex && currentIndex <= endIndex;
  }

  return currentIndex >= startIndex || currentIndex <= endIndex;
};

export const isNongsaroScheduleEraInPeriods = (
  era: NongsaroScheduleEraRange,
  periods: NongsaroSchedulePeriod[],
): boolean => periods.some((period) => isPeriodInEraRange(period, era));

const formatSchedulePeriod = (period: NongsaroSchedulePeriod): string => `${period.month}월 ${period.era}`;

const formatSchedulePeriodRange = (periods: NongsaroSchedulePeriod[]): string => {
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (!first || !last) return "이번 주";
  if (sameSchedulePeriod(first, last)) return formatSchedulePeriod(first);
  return `${formatSchedulePeriod(first)}~${formatSchedulePeriod(last)}`;
};

const workScheduleMatchRank = (cropName: string, schedule: TaskEngineWorkSchedule): number => {
  const normalizedCrop = normalizeMatchText(cropName);
  if (!normalizedCrop) return 1;

  const searchable = normalizeMatchText(`${schedule.cropName} ${schedule.title}`);
  return searchable.includes(normalizedCrop) ? 0 : 1;
};

const isMonthInRange = (month: number, beginMonth: number | null, endMonth: number | null): boolean => {
  if (beginMonth === null && endMonth === null) return false;
  const start = beginMonth ?? endMonth;
  const end = endMonth ?? beginMonth;
  if (start === null || end === null) return false;

  if (start <= end) {
    return month >= start && month <= end;
  }

  return month >= start || month <= end;
};

interface WorkScheduleCandidate {
  schedule: TaskEngineWorkSchedule;
  era: TaskEngineWorkScheduleEra;
  matchType: "current" | "upcoming" | "month";
}

const scheduleEraRangeLabel = (era: TaskEngineWorkScheduleEra): string => {
  const startMonth = era.beginMonth ?? era.endMonth;
  const endMonth = era.endMonth ?? era.beginMonth;
  const startEra = normalizeEraSegment(era.beginEra);
  const endEra = normalizeEraSegment(era.endEra);

  if (startMonth && endMonth && startMonth !== endMonth) {
    return `${startMonth}월 ${startEra ?? "상"}-${endMonth}월 ${endEra ?? "하"}`;
  }

  if (startMonth || endMonth) {
    const month = startMonth ?? endMonth;
    if (startEra && endEra && startEra !== endEra) return `${month}월 ${startEra}-${endEra}`;
    return `${month}월 ${startEra ?? endEra ?? ""}`.trim();
  }

  return "시기 미상";
};

const collectWorkScheduleCandidates = (
  cropName: string,
  workSchedules: TaskEngineWorkSchedule[],
  currentPeriod: NongsaroSchedulePeriod,
  weekPeriods: NongsaroSchedulePeriod[],
): WorkScheduleCandidate[] => {
  const currentMatches: WorkScheduleCandidate[] = [];
  const upcomingMatches: WorkScheduleCandidate[] = [];
  const monthMatches: WorkScheduleCandidate[] = [];
  const weekMonths = new Set(weekPeriods.map((period) => period.month));

  const sortedSchedules = [...workSchedules].sort(
    (a, b) => workScheduleMatchRank(cropName, a) - workScheduleMatchRank(cropName, b),
  );

  for (const schedule of sortedSchedules) {
    for (const era of schedule.eras) {
      if (isNongsaroScheduleEraInPeriods(era, [currentPeriod])) {
        currentMatches.push({ schedule, era, matchType: "current" });
        continue;
      }

      if (isNongsaroScheduleEraInPeriods(era, weekPeriods)) {
        upcomingMatches.push({ schedule, era, matchType: "upcoming" });
        continue;
      }

      if ([...weekMonths].some((month) => isMonthInRange(month, era.beginMonth, era.endMonth))) {
        monthMatches.push({ schedule, era, matchType: "month" });
      }
    }
  }

  const periodMatches = [...currentMatches, ...upcomingMatches];
  const candidates = periodMatches.length > 0 ? periodMatches : monthMatches;
  const seen = new Set<string>();

  return candidates
    .filter((candidate) => {
      const key = [
        candidate.schedule.sourceId,
        normalizeHtmlSingleLineText(candidate.era.operationName) ?? candidate.era.operationName,
        candidate.era.farmWorkFlag ?? "",
        candidate.era.beginMonth ?? "",
        candidate.era.beginEra ?? "",
        candidate.era.endMonth ?? "",
        candidate.era.endEra ?? "",
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
};

const daysUntilScheduleEra = (
  today: Date,
  era: TaskEngineWorkScheduleEra,
  maxDays = 60,
): number | null => {
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const period = getNongsaroSchedulePeriod(new Date(today.getTime() + offset * MS_PER_DAY));
    if (isNongsaroScheduleEraInPeriods(era, [period])) return offset;
  }
  return null;
};

type WorkScheduleWeatherCondition = "rain" | "wind" | "heat" | "cold";

const getWorkScheduleWeatherCondition = (operationName: string): WorkScheduleWeatherCondition | null => {
  const text = normalizeMatchText(operationName);
  if (/(장마|집중호우|강수|폭우|배수|침수)/.test(text)) return "rain";
  if (/(강풍|태풍|돌풍)/.test(text)) return "wind";
  if (/(고온|폭염)/.test(text)) return "heat";
  if (/(저온|서리|동해)/.test(text)) return "cold";
  return null;
};

const isWorkScheduleWeatherConditionTriggered = (
  condition: WorkScheduleWeatherCondition,
  weatherRisk: TaskEngineWeatherRisk | null,
): boolean => {
  if (!weatherRisk) return false;
  if (condition === "rain") return (weatherRisk.precipitation ?? 0) >= 20;
  if (condition === "wind") return (weatherRisk.wind ?? 0) >= 9;
  if (condition === "heat") return (weatherRisk.temperature ?? Number.NEGATIVE_INFINITY) >= 33;
  return (weatherRisk.temperature ?? Number.POSITIVE_INFINITY) <= 0;
};

const buildWorkScheduleTask = (
  cropName: string,
  workSchedules: TaskEngineWorkSchedule[],
  today: Date,
  weatherRisk: TaskEngineWeatherRisk | null,
): TaskCardDraft[] => {
  const weekPeriods = getNongsaroScheduleWeekPeriods(today);
  const currentPeriod = getNongsaroSchedulePeriod(today);
  const weekPeriodText = formatSchedulePeriodRange(weekPeriods);
  const candidates = collectWorkScheduleCandidates(cropName, workSchedules, currentPeriod, weekPeriods);

  return candidates.map(({ schedule, era, matchType }) => {
    const currentMatch = matchType === "current";
    const workFlagText = era.farmWorkFlag ? `${era.farmWorkFlag} · ` : "";
    const currentPeriodText = `${currentPeriod.month}월 ${currentPeriod.era}`;
    const eraRangeText = scheduleEraRangeLabel(era);
    const operationName = normalizeHtmlSingleLineText(era.operationName) ?? era.operationName.trim();
    const weatherCondition = getWorkScheduleWeatherCondition(operationName);
    const needsConditionReview = currentMatch
      && weatherCondition !== null
      && !isWorkScheduleWeatherConditionTriggered(weatherCondition, weatherRisk);
    const dueInDays = currentMatch
      ? needsConditionReview ? 1 : 0
      : daysUntilScheduleEra(today, era) ?? 5;

    return {
      priority: currentMatch && !needsConditionReview ? 3 : 4,
      title: `${needsConditionReview ? "농작업일정 확인" : "농작업일정 실행"}: ${operationName}`,
      reason: needsConditionReview
        ? `${schedule.cropName} ${workFlagText}${eraRangeText} 조건부 작업이지만 현재 기상 조건에서는 즉시 실행 대상이 아닙니다. 내일 공식 예보를 다시 확인합니다.`
        : currentMatch
        ? `${schedule.cropName} ${workFlagText}현재 ${currentPeriodText}와 겹치는 농사로 농작업일정(${schedule.title})의 ${eraRangeText} 작업입니다.`
        : `${schedule.cropName} ${workFlagText}이번 주(${weekPeriodText})의 ${eraRangeText} 시작일까지 ${dueInDays}일 남은 농사로 농작업일정(${schedule.title}) 작업입니다.`,
      checks: needsConditionReview
        ? [
            check("기상청 강수·풍속 예보 확인"),
            check("작업 실행 조건 충족 여부 판단"),
            check(`조건 충족 시 ${operationName} 준비`),
          ]
        : [
            check(`${operationName} 적용 여부 확인`),
            check("필지 생육단계와 농작업일정 비교"),
            check("필요 자재·장비·인력 준비 상태 확인"),
          ],
      durationMin: 20,
      sources: [
        {
          name: `농사로 농작업일정: ${schedule.title}`,
          url: schedule.fileUrl ?? undefined,
        },
        {
          name: `농사로 농작업일정 시기: ${operationName}`,
        },
        ...(era.videoUrl
          ? [
              {
                name: `농사로 농작업일정 동영상: ${operationName}`,
                url: era.videoUrl,
              },
            ]
          : []),
      ],
      dueInDays,
      detailText: schedule.detailText,
    };
  });
};

const briefingDueInDays = (briefing: TaskEngineBriefing, today: Date): number | null => {
  const todayKey = getKstDateKey(today);
  const start = briefing.periodStart ?? null;
  const end = briefing.periodEnd ?? null;

  if (end && todayKey > end) return null;
  if (!start || todayKey >= start) return 0;

  const startDate = new Date(`${start}T00:00:00+09:00`);
  const todayDate = new Date(`${todayKey}T00:00:00+09:00`);
  return Math.max(1, Math.ceil((startDate.getTime() - todayDate.getTime()) / MS_PER_DAY));
};

const buildBriefingTasks = (briefing: TaskEngineBriefing | null, today: Date): TaskCardDraft[] => {
  if (!briefing || briefing.actionBullets.length === 0) return [];
  const dueInDays = briefingDueInDays(briefing, today);
  if (dueInDays === null) return [];

  const source: TaskCardDraftSource = {
    name: briefing.sourceTitle,
    url: briefing.sourceUrl ?? undefined,
    collectedAt: briefing.publishedAt ?? undefined,
  };

  return briefing.actionBullets.slice(0, 3).map((bullet) => {
    const action = normalizeHtmlSingleLineText(bullet) ?? bullet.trim();
    return {
      priority: 3,
      title: `주간농사정보 실행: ${action}`,
      reason: briefing.cautionBullets[0]
        ? `${briefing.headline} · 주의: ${briefing.cautionBullets[0]}`
        : briefing.headline,
      checks: [check(action)],
      durationMin: 20,
      sources: [source],
      dueInDays,
    };
  });
};

export const buildTaskCardDrafts = (input: BuildTaskCardDraftsInput): TaskCardDraft[] => {
  const today = input.today ?? new Date();
  const workScheduleTasks = input.includeWorkScheduleTasks === false
    ? []
    : buildWorkScheduleTask(input.cropName, input.workSchedules, today, input.weatherRisk);
  const briefingTasks = workScheduleTasks.length > 0
    ? []
    : buildBriefingTasks(input.briefing ?? null, today);
  const tasks = [
    ...briefingTasks,
    ...buildWeatherTasks(input.weatherRisk),
    ...buildPestTask(input.pestRisks),
    ...workScheduleTasks,
  ];

  const sortedTasks = tasks.sort((a, b) => a.priority - b.priority);
  const todayTasks = sortedTasks.filter((task) => task.dueInDays === 0).slice(0, 3);
  const upcomingTasks = sortedTasks.filter((task) => task.dueInDays > 0).slice(0, 3);
  return [...todayTasks, ...upcomingTasks];
};
