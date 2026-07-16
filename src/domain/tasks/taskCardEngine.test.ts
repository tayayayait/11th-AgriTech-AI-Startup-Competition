import { describe, expect, it } from "vitest";
import { buildTaskCardDrafts, getNongsaroSchedulePeriod, splitTasksByDueDate } from "@/domain/tasks/taskCardEngine";

const lowWeatherRisk = {
  score: 0,
  summary: "low weather risk",
  precipitation: 0,
  temperature: 20,
  wind: 2,
  humidity: 55,
  collectedAt: "2026-05-06T07:00:00.000Z",
};

describe("task card engine", () => {
  it("splits pending tasks by their KST due date", () => {
    const tasks = [
      { id: "today", due_at: "2026-07-16T00:00:00.000Z" },
      { id: "upcoming", due_at: "2026-07-18T15:00:00.000Z" },
      { id: "legacy", due_at: null },
    ];

    const result = splitTasksByDueDate(tasks, new Date("2026-07-16T12:00:00+09:00"));

    expect(result.today.map((task) => task.id)).toEqual(["today", "legacy"]);
    expect(result.upcoming.map((task) => task.id)).toEqual(["upcoming"]);
  });

  it("creates urgent today tasks from weather and pest risk", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "벼",
      weatherRisk: {
        score: 82,
        summary: "강수 32mm, 고습 88%",
        precipitation: 32,
        temperature: 24,
        wind: 4,
        humidity: 88,
        collectedAt: "2026-05-06T07:00:00.000Z",
      },
      pestRisks: [
        {
          candidateName: "벼 병해충 위험 예보/확인 권고",
          score: 75,
          reasons: ["강수 후 병해충 발생 가능성 확인 필요"],
          officialSources: ["병해충 발생정보: 병해충발생정보 제 4호"],
          createdAt: "2026-05-06T07:00:00.000Z",
        },
      ],
      workSchedules: [],
      weeklyInfos: [],
    });

    expect(tasks[0]).toMatchObject({
      priority: 1,
      title: "강수 후 배수로·포장 상태 점검",
      dueInDays: 0,
      durationMin: 30,
    });
    expect(tasks.map((task) => task.title)).toContain("병해충 위험 예보 근거 확인");
    expect(tasks[0].checks.map((check) => check.label)).toEqual(
      expect.arrayContaining(["배수로 막힘 확인", "잎·줄기 병반 확인"]),
    );
    expect(tasks[0].sources.map((source) => source.name)).toContain("KMA 날씨 위험도");
  });

  it("returns the Nongsaro month and upper/middle/lower period for a date", () => {
    expect(getNongsaroSchedulePeriod(new Date("2026-05-07T00:00:00.000+09:00"))).toEqual({
      month: 5,
      era: "상",
    });
    expect(getNongsaroSchedulePeriod(new Date("2026-05-15T00:00:00.000+09:00"))).toEqual({
      month: 5,
      era: "중",
    });
    expect(getNongsaroSchedulePeriod(new Date("2026-05-21T00:00:00.000+09:00"))).toEqual({
      month: 5,
      era: "하",
    });
  });

  it("does not create an automatic task from weekly farm info alone", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [],
      weeklyInfos: [
        {
          title: "주간농사정보 제 19호",
          publishedAt: "2026-05-07",
          sourceUrl: "https://example.test/week.pdf",
        },
      ],
    });

    expect(tasks).toEqual([]);
  });

  it("creates work schedule tasks for eras that overlap the next 7 days", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: "https://example.test/grape.pdf",
          eras: [
            {
              operationName: "꽃송이<br/>다듬기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "상",
              endEra: "상",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: "https://example.test/video-upper",
            },
            {
              operationName: "봉지 씌우기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "중",
              endEra: "중",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: "https://example.test/video-middle",
            },
          ],
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.title)).toEqual([
      "농작업일정 실행: 꽃송이 다듬기",
      "농작업일정 실행: 봉지 씌우기",
    ]);
    expect(tasks[0]).toMatchObject({ priority: 3, dueInDays: 0 });
    expect(tasks[1]).toMatchObject({ priority: 4, dueInDays: 4 });
    expect(tasks[0].reason).toContain("5월 상");
    expect(tasks[0].reason).toContain("무가온");
    expect(tasks[0].sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "농사로 농작업일정: 포도(무가온)", url: "https://example.test/grape.pdf" }),
        expect.objectContaining({ name: "농사로 농작업일정 시기: 꽃송이 다듬기" }),
        expect.objectContaining({ url: "https://example.test/video-upper" }),
      ]),
    );
  });

  it("can skip automatic work schedule task drafts while preserving other task sources", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: {
        score: 82,
        summary: "강수 32mm",
        precipitation: 32,
        temperature: 24,
        wind: 4,
        humidity: 88,
        collectedAt: "2026-05-07T00:00:00.000Z",
      },
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: "https://example.test/grape.pdf",
          eras: [
            {
              operationName: "꽃송이 다듬기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "상",
              endEra: "상",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
      includeWorkScheduleTasks: false,
    });

    expect(tasks.map((task) => task.title)).toEqual([
      "강수 후 배수로·포장 상태 점검",
      "고습 병 발생 징후 확인",
    ]);
    expect(tasks.some((task) => task.title.startsWith("농작업일정 실행:"))).toBe(false);
  });

  it("treats work schedule eras that overlap the next 7 days as current-week matches", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-08T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: null,
          eras: [
            {
              operationName: "봉지 씌우기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "중",
              endEra: "중",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      priority: 4,
      title: "농작업일정 실행: 봉지 씌우기",
      dueInDays: 3,
    });
    expect(tasks[0].reason).toContain("이번 주");
    expect(tasks[0].reason).toContain("5월 중");
  });

  it("prefers current middle-period work schedule eras on May 15", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-15T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: null,
          eras: [
            {
              operationName: "꽃송이 다듬기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "상",
              endEra: "상",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
            {
              operationName: "봉지 씌우기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "중",
              endEra: "중",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("농작업일정 실행: 봉지 씌우기");
    expect(tasks[0].reason).toContain("5월 중");
    expect(tasks[0].dueInDays).toBe(0);
  });

  it("falls back to same-month work schedule eras outside the next 7 days at lower priority", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-01T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: null,
          eras: [
            {
              operationName: "봉지 씌우기",
              farmWorkFlag: "무가온",
              beginMonth: 5,
              endMonth: 5,
              beginEra: "중",
              endEra: "중",
              requiredMonth: 1,
              infoType: "생육과정(주요농작업)",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      priority: 4,
      title: "농작업일정 실행: 봉지 씌우기",
      dueInDays: 10,
    });
  });

  it("limits automatic work schedule cards to three candidates", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "포도",
      today: new Date("2026-05-07T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "grape-1",
          title: "포도(무가온)",
          cropName: "과수",
          detailText: null,
          fileUrl: null,
          eras: ["작업 1", "작업 2", "작업 3", "작업 4"].map((operationName) => ({
            operationName,
            farmWorkFlag: "무가온",
            beginMonth: 5,
            endMonth: 5,
            beginEra: "상",
            endEra: "상",
            requiredMonth: 1,
            infoType: "생육과정(주요농작업)",
            videoUrl: null,
          })),
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks.map((task) => task.title)).toEqual([
      "농작업일정 실행: 작업 1",
      "농작업일정 실행: 작업 2",
      "농작업일정 실행: 작업 3",
    ]);
  });

  it("keeps an untriggered rain-response schedule as an upcoming condition check", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "복숭아",
      today: new Date("2026-07-17T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [
        {
          sourceId: "peach-1",
          title: "복숭아",
          cropName: "복숭아",
          detailText: null,
          fileUrl: null,
          eras: [
            {
              operationName: "장마, 집중호우시 배수대책",
              farmWorkFlag: "재해대책",
              beginMonth: 7,
              endMonth: 8,
              beginEra: "상",
              endEra: "하",
              requiredMonth: 1,
              infoType: "주요농작업",
              videoUrl: null,
            },
          ],
        },
      ],
      weeklyInfos: [],
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      priority: 4,
      title: "농작업일정 확인: 장마, 집중호우시 배수대책",
      dueInDays: 1,
    });
    expect(tasks[0].reason).toContain("현재 기상 조건에서는 즉시 실행 대상이 아닙니다");
  });

  it("creates one current-period task card per weekly briefing action when no work schedule exists", () => {
    const tasks = buildTaskCardDrafts({
      cropName: "복숭아",
      today: new Date("2026-07-17T00:00:00.000+09:00"),
      weatherRisk: lowWeatherRisk,
      pestRisks: [],
      workSchedules: [],
      weeklyInfos: [],
      briefing: {
        headline: "복숭아 이번 주 관리",
        actionBullets: ["조생종 숙도를 확인합니다.", "열과 발생 여부를 확인합니다."],
        cautionBullets: ["약제는 등록 여부를 확인합니다."],
        sourceTitle: "주간농사정보 제29호",
        sourceUrl: "https://example.test/week.pdf",
        publishedAt: "2026-07-13",
        periodStart: "2026-07-13",
        periodEnd: "2026-07-19",
      },
    });

    expect(tasks.map((task) => task.title)).toEqual([
      "주간농사정보 실행: 조생종 숙도를 확인합니다.",
      "주간농사정보 실행: 열과 발생 여부를 확인합니다.",
    ]);
    expect(tasks.every((task) => task.dueInDays === 0)).toBe(true);
    expect(tasks.every((task) => task.checks.length === 1)).toBe(true);
  });
});
