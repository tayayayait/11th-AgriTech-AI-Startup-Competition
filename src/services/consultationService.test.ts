import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConsultationThread,
  deleteConsultationThread,
  getConsultationContextSnapshot,
  getConsultationMessagesByThread,
  getConsultationThreadsByField,
  sendConsultationMessage,
} from "./consultationService";
import { supabase } from "@/integrations/supabase/client";
import { analyzeWithGemini } from "./geminiClient";
import type { FieldRow } from "@/domain/fields/types";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("./geminiClient", () => ({
  analyzeWithGemini: vi.fn(),
}));

const supabaseFromMock = vi.mocked(supabase.from);
const analyzeWithGeminiMock = vi.mocked(analyzeWithGemini);

const field: FieldRow = {
  id: "field-1",
  name: "구미 포도밭",
  crop_name: "포도",
  area_m2: 699.222,
  address: "경상북도 구미시 옥계동",
  lat: 36.1,
  lng: 128.4,
  pnu: null,
  farmmap_meta: {},
  risk_level: "low",
  risk_score: 0,
  growth_stage: "확실한 정보 없음",
  updated_at: "2026-05-09T04:30:00Z",
};

type ThreadRow = {
  id: string;
  field_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type MessageRow = {
  id: string;
  field_id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
};

type SupabaseStore = {
  threads: ThreadRow[];
  messages: MessageRow[];
  threadInserts: Array<Record<string, unknown>>;
  threadUpdates: Array<Record<string, unknown>>;
  threadDeleteFilters: Array<{ column: string; value: string }>;
  messageInserts: Array<Record<string, unknown>>;
  threadGtFilters: Array<{ column: string; value: string }>;
};

function setupSupabaseStore(overrides: Partial<SupabaseStore> = {}) {
  const store: SupabaseStore = {
    threads: [
      {
        id: "thread-new",
        field_id: field.id,
        title: "최근 상담",
        created_at: "2026-05-09T04:30:00Z",
        updated_at: "2026-05-09T04:40:00Z",
        expires_at: "2026-06-08T04:40:00Z",
      },
    ],
    messages: [],
    threadInserts: [],
    threadUpdates: [],
    threadDeleteFilters: [],
    messageInserts: [],
    threadGtFilters: [],
    ...overrides,
  };

  supabaseFromMock.mockImplementation((table: string) => {
    if (table === "weekly_farm_infos") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: "weekly-1",
              subject: "주간농사정보 제18호",
              reg_dt: "2026-05-01",
              period_start: "2026-05-04",
              period_end: "2026-05-10",
              down_url: "https://example.com/weekly.pdf",
              summary_text: "포도 및 과수 개화기 물관리와 캠벨얼리 적정 열매솎기 기준 안내",
              summary_model: "gemini",
              summary_fetched_at: "2026-05-09T04:00:00Z",
              summary_payload: {
                headline: "포도 및 과수 개화기 물관리와 캠벨얼리 적정 열매솎기 기준 안내",
                cropName: "포도",
                cropGroup: "과수",
                summaryBullets: ["건조한 시기에는 관수 상태를 확인한다."],
                actionBullets: ["토양 수분 확인", "열매솎기 기준 확인"],
                cautionBullets: ["과습을 피한다"],
                evidenceSnippets: ["주간농사정보 제18호"],
              },
            },
          ],
          error: null,
        }),
      } as never;
    }

    if (table === "weather_risks") {
      const result = {
        data: [
          {
            temperature: 20.5,
            humidity: 18,
            precipitation: 0,
            wind: 8.5,
            forecast_at: "2026-05-09T04:00:00Z",
          },
        ],
        error: null,
      };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)),
      } as never;
    }

    if (table === "diagnosis_records") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as never;
    }

    if (table === "task_cards") {
      const result = {
        data: [
          {
            id: "task-pending-1",
            field_id: field.id,
            priority: 1,
            title: "포도밭 관수",
            reason: "고온과 무강수로 수분 스트레스가 우려됨",
            duration_min: 30,
            due_at: "2026-05-09T18:00:00Z",
            checks: [{ label: "토양 수분 확인", done: false }],
            sources: [],
            status: "pending",
            completed_at: null,
          },
          {
            id: "task-pending-2",
            field_id: field.id,
            priority: 2,
            title: "대기 작업 확인",
            reason: "등록된 작업의 진행 상태 확인 필요",
            duration_min: 15,
            due_at: null,
            checks: [],
            sources: [],
            status: "pending",
            completed_at: null,
          },
          {
            id: "task-done-1",
            field_id: field.id,
            priority: 3,
            title: "완료 작업",
            reason: null,
            duration_min: null,
            due_at: null,
            checks: [],
            sources: [],
            status: "done",
            completed_at: "2026-05-08T18:00:00Z",
          },
        ],
        error: null,
      };
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)),
      } as never;
    }

    if (table === "consultation_threads") {
      let rows = [...store.threads];
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: string) => {
          rows = rows.filter((row) => row[column as keyof ThreadRow] === value);
          return builder;
        }),
        gt: vi.fn((column: string, value: string) => {
          store.threadGtFilters.push({ column, value });
          return builder;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          rows.sort((a, b) =>
            options?.ascending
              ? String(a[column as keyof ThreadRow]).localeCompare(String(b[column as keyof ThreadRow]))
              : String(b[column as keyof ThreadRow]).localeCompare(String(a[column as keyof ThreadRow])),
          );
          return builder;
        }),
        limit: vi.fn(async (limit: number) => ({ data: rows.slice(0, limit), error: null })),
        maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
        insert: vi.fn((payload: Record<string, unknown>) => {
          store.threadInserts.push(payload);
          const row: ThreadRow = {
            id: "thread-created",
            field_id: String(payload.field_id),
            title: String(payload.title ?? "새 상담"),
            created_at: "2026-05-09T05:00:00Z",
            updated_at: "2026-05-09T05:00:00Z",
            expires_at: "2026-06-08T05:00:00Z",
          };
          store.threads.unshift(row);
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: row, error: null })),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          store.threadUpdates.push(payload);
          const updated = { ...rows[0], ...payload } as ThreadRow;
          return {
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: updated, error: null })),
          };
        }),
        delete: vi.fn(() => {
          const deleteBuilder = {
            eq: vi.fn((column: string, value: string) => {
              store.threadDeleteFilters.push({ column, value });
              return deleteBuilder;
            }),
            lte: vi.fn(async () => ({ error: null })),
            then: vi.fn((onFulfilled, onRejected) => Promise.resolve({ error: null }).then(onFulfilled, onRejected)),
          };
          return deleteBuilder;
        }),
      };
      return builder as never;
    }

    if (table === "consultation_messages") {
      let rows = [...store.messages];
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: string) => {
          rows = rows.filter((row) => row[column as keyof MessageRow] === value);
          return builder;
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          rows.sort((a, b) =>
            options?.ascending
              ? String(a[column as keyof MessageRow]).localeCompare(String(b[column as keyof MessageRow]))
              : String(b[column as keyof MessageRow]).localeCompare(String(a[column as keyof MessageRow])),
          );
          return builder;
        }),
        limit: vi.fn(async (limit: number) => ({ data: rows.slice(0, limit), error: null })),
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          store.messageInserts.push(payload);
          return { error: null };
        }),
      };
      return builder as never;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return store;
}

describe("consultationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeWithGeminiMock.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: "AI 답변" }],
            },
          },
        ],
      },
      source: "gemini",
      model: "test",
      fetchedAt: "2026-05-09T05:00:00Z",
    });
  });

  it("선택 필지 기준 상담 스레드를 최근순으로 조회한다", async () => {
    const store = setupSupabaseStore({
      threads: [
        {
          id: "thread-old",
          field_id: field.id,
          title: "이전 상담",
          created_at: "2026-05-08T04:00:00Z",
          updated_at: "2026-05-08T04:00:00Z",
          expires_at: "2026-06-07T04:00:00Z",
        },
        {
          id: "thread-new",
          field_id: field.id,
          title: "최근 상담",
          created_at: "2026-05-09T04:00:00Z",
          updated_at: "2026-05-09T04:00:00Z",
          expires_at: "2026-06-08T04:00:00Z",
        },
      ],
    });

    const threads = await getConsultationThreadsByField(field.id);

    expect(threads.map((thread) => thread.id)).toEqual(["thread-new", "thread-old"]);
    expect(store.threadGtFilters).toEqual([expect.objectContaining({ column: "expires_at" })]);
  });

  it("새 상담 스레드를 생성하고 선택 스레드의 메시지를 조회한다", async () => {
    const store = setupSupabaseStore({
      messages: [
        {
          id: "msg-1",
          field_id: field.id,
          thread_id: "thread-created",
          role: "assistant",
          content: "기존 답변",
          context_snapshot: { field: { crop: "포도" } },
          created_at: "2026-05-09T05:01:00Z",
        },
      ],
    });

    const thread = await createConsultationThread(field.id);
    const messages = await getConsultationMessagesByThread(thread.id);

    expect(store.threadInserts[0]).toEqual({ field_id: field.id, title: "새 상담" });
    expect(thread.id).toBe("thread-created");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "msg-1",
      fieldId: field.id,
      threadId: "thread-created",
      content: "기존 답변",
    });
  });

  it("선택 상담 스레드를 삭제한다", async () => {
    const store = setupSupabaseStore();

    await deleteConsultationThread(field.id, "thread-new");

    expect(store.threadDeleteFilters).toEqual([
      { column: "id", value: "thread-new" },
      { column: "field_id", value: field.id },
    ]);
  });

  it("필지 컨텍스트에 이번 주 농사 브리핑을 포함하고 병해충 위험 후보는 포함하지 않는다", async () => {
    setupSupabaseStore();

    const snapshot = await getConsultationContextSnapshot(field);

    expect(snapshot.weeklyBriefing?.title).toContain("포도");
    expect(snapshot.weeklyBriefing?.actionItems).toContain("토양 수분 확인");
    expect(snapshot).not.toHaveProperty("pestRisk");
    expect(snapshot).not.toHaveProperty("riskRecords");
  });

  it("필지 컨텍스트에 미완료 작업의 실제 상세 정보를 포함한다", async () => {
    setupSupabaseStore();

    const snapshot = await getConsultationContextSnapshot(field);

    expect(snapshot.tasks).toEqual([
      expect.objectContaining({
        id: "task-pending-1",
        title: "포도밭 관수",
        status: "pending",
        priority: 1,
        dueAt: "2026-05-09T18:00:00Z",
        reason: "고온과 무강수로 수분 스트레스가 우려됨",
        incompleteChecks: ["토양 수분 확인"],
      }),
      expect.objectContaining({
        id: "task-pending-2",
        title: "대기 작업 확인",
        status: "pending",
      }),
    ]);
  });

  it("Gemini 질문 전달 시 선택 상담 스레드의 최근 대화와 필지 컨텍스트를 포함하고 메시지를 저장한다", async () => {
    const store = setupSupabaseStore({
      threads: [
        {
          id: "thread-new",
          field_id: field.id,
          title: "새 상담",
          created_at: "2026-05-09T04:00:00Z",
          updated_at: "2026-05-09T04:00:00Z",
          expires_at: "2026-06-08T04:00:00Z",
        },
      ],
      messages: [
        {
          id: "msg-old",
          field_id: field.id,
          thread_id: "thread-new",
          role: "assistant",
          content: "이전 답변",
          context_snapshot: null,
          created_at: "2026-05-09T04:10:00Z",
        },
      ],
    });

    const result = await sendConsultationMessage({
      field,
      threadId: "thread-new",
      question: "오늘 물을 줘야 하나요?",
    });

    const request = analyzeWithGeminiMock.mock.calls[0][0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain("구미 포도밭");
    expect(prompt).toContain("이번 주 농사 브리핑");
    expect(prompt).toContain("이전 답변");
    expect(prompt).toContain("오늘 물을 줘야 하나요?");
    expect(store.messageInserts).toEqual([
      expect.objectContaining({
        field_id: field.id,
        thread_id: "thread-new",
        role: "user",
        content: "오늘 물을 줘야 하나요?",
      }),
      expect.objectContaining({
        field_id: field.id,
        thread_id: "thread-new",
        role: "assistant",
        content: "AI 답변",
      }),
    ]);
    expect(store.threadUpdates[0]).toMatchObject({ title: "오늘 물을 줘야 하나요?" });
    expect(result.thread.id).toBe("thread-new");
    expect(result.answer).toBe("AI 답변");
  });

  it("allows natural everyday conversation without forcing a farm report format", async () => {
    setupSupabaseStore({
      threads: [
        {
          id: "thread-casual",
          field_id: field.id,
          title: "새 상담",
          created_at: "2026-05-09T04:00:00Z",
          updated_at: "2026-05-09T04:00:00Z",
          expires_at: "2026-06-08T04:00:00Z",
        },
      ],
    });

    await sendConsultationMessage({
      field,
      threadId: "thread-casual",
      question: "안녕하세요",
    });

    const request = analyzeWithGeminiMock.mock.calls[0][0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain("일상적인 대화");
    expect(prompt).toContain("질문 유형에 따라 답변 형식");
    expect(prompt).toContain("강제로 붙이지 않는다");
  });

  it("combines general agricultural knowledge with the selected field context", async () => {
    setupSupabaseStore({
      threads: [
        {
          id: "thread-general",
          field_id: field.id,
          title: "새 상담",
          created_at: "2026-05-09T04:00:00Z",
          updated_at: "2026-05-09T04:00:00Z",
          expires_at: "2026-06-08T04:00:00Z",
        },
      ],
    });

    await sendConsultationMessage({
      field,
      threadId: "thread-general",
      question: "포도 재배에서 적정 습도가 어떻게 되나요?",
    });

    const request = analyzeWithGeminiMock.mock.calls[0][0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain("일반적인 농업 지식");
    expect(prompt).toContain("필지 정보와 일반 지식을 구분");
    expect(prompt).toContain("현재 필지 컨텍스트");
  });

  it("includes exact pending task details and prevents count-only guidance", async () => {
    setupSupabaseStore({
      threads: [
        {
          id: "thread-tasks",
          field_id: field.id,
          title: "새 상담",
          created_at: "2026-05-09T04:00:00Z",
          updated_at: "2026-05-09T04:00:00Z",
          expires_at: "2026-06-08T04:00:00Z",
        },
      ],
    });

    await sendConsultationMessage({
      field,
      threadId: "thread-tasks",
      question: "오늘 어떤 작업을 하는 게 좋을까요?",
    });

    const request = analyzeWithGeminiMock.mock.calls[0][0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain("포도밭 관수");
    expect(prompt).toContain("고온과 무강수로 수분 스트레스가 우려됨");
    expect(prompt).toContain("작업명과 작업 이유");
    expect(prompt).toContain("작업 개수만");
  });

  it("선택 필지가 없으면 상담 요청을 거부한다", async () => {
    await expect(
      sendConsultationMessage({
        field: null,
        threadId: "thread-new",
        question: "질문",
      }),
    ).rejects.toThrow("선택된 필지가 없습니다.");
  });
});
