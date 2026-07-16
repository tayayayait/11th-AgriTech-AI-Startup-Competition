import type { TaskCardDraft } from "@/domain/tasks/taskCardEngine";
import { analyzeWithGemini } from "@/services/geminiClient";
import { z } from "zod";

export interface TaskCardRefinement {
  title: string;
  reason: string;
  checks: string[];
  priority: number;
  sourceNames: string[];
}

export function applyTaskCardRefinements(
  drafts: TaskCardDraft[],
  refinements: TaskCardRefinement[],
): TaskCardDraft[] {
  const refinementByTitle = new Map(refinements.map((refinement) => [refinement.title, refinement]));

  return drafts.map((draft) => {
    const refinement = refinementByTitle.get(draft.title);
    if (!refinement) return draft;

    return {
      ...draft,
      reason: refinement.reason,
      checks: refinement.checks.map((label) => ({ label, done: false })),
      priority: Math.max(1, Math.min(5, refinement.priority)),
    };
  });
}

export interface BuildTaskCardRefinementPromptInput {
  cropName: string;
  todayIso: string;
  drafts: TaskCardDraft[];
}

export interface RefineTaskCardsWithGeminiInput extends BuildTaskCardRefinementPromptInput {
  signal?: AbortSignal;
}

const taskCardRefinementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  checks: z.array(z.string().trim().min(1).max(120)).min(1).max(5),
  priority: z.number().int().min(1).max(5),
  sourceNames: z.array(z.string().trim().min(1).max(160)).max(5),
});

const taskCardRefinementResponseSchema = z.object({
  cards: z.array(taskCardRefinementSchema).max(8),
});

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

function parseJsonText(text: string): unknown {
  const cleaned = stripFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Gemini task card JSON parse failed.");
  }
}

function extractGeminiJson(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini task card response is empty.");
  }

  const source = responseData as Record<string, unknown>;
  if ("cards" in source) return source;

  if (Array.isArray(source.candidates)) {
    for (const candidate of source.candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const content = (candidate as Record<string, unknown>).content;
      if (!content || typeof content !== "object") continue;
      const parts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(parts)) continue;

      for (const part of parts) {
        if (!part || typeof part !== "object") continue;
        const text = (part as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) return parseJsonText(text);
      }
    }
  }

  throw new Error("Gemini task card JSON was not found.");
}

export function parseTaskCardRefinementFromGeminiResponse(responseData: unknown): TaskCardRefinement[] {
  const payload = extractGeminiJson(responseData);
  const parsed = taskCardRefinementResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Gemini task card JSON schema mismatch.");
  }

  return parsed.data.cards;
}

export function getTaskCardRefinementJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      cards: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            checks: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
            priority: { type: "integer" },
            sourceNames: { type: "array", items: { type: "string" }, maxItems: 5 },
          },
          required: ["title", "reason", "checks", "priority", "sourceNames"],
        },
      },
    },
    required: ["cards"],
  };
}

export function buildTaskCardRefinementPrompt(input: BuildTaskCardRefinementPromptInput): string {
  const groundedDrafts = input.drafts.map((draft) => ({
    title: draft.title,
    reason: draft.reason,
    checks: draft.checks.map((check) => check.label),
    priority: draft.priority,
    dueInDays: draft.dueInDays,
    durationMin: draft.durationMin,
    officialSources: draft.sources.map((source) => ({
      name: source.name,
      url: source.url ?? null,
      collectedAt: source.collectedAt ?? null,
    })),
  }));

  return [
    "당신은 농업 현장 작업카드 편집 보조입니다.",
    "새 작업을 만들지 말고, 아래 deterministic task card만 더 명확한 제목/사유/체크리스트로 정리하세요.",
    "공식 API 근거에 없는 병명, 해충명, 농약명, 방제 지시, 작업 지시는 추가하지 마세요.",
    "공식 API 근거가 부족하면 원문 확인 또는 현장 확인 작업으로만 표현하세요.",
    "반드시 JSON 객체만 출력하세요. markdown, 코드블록, 설명문은 금지합니다.",
    "JSON 형식: {\"cards\":[{\"title\":\"\",\"reason\":\"\",\"checks\":[\"\"],\"priority\":3,\"sourceNames\":[\"\"]}]}",
    `작물: ${input.cropName || "확실한 정보 없음"}`,
    `기준일: ${input.todayIso}`,
    "공식 API 근거 기반 작업카드:",
    JSON.stringify(groundedDrafts, null, 2),
  ].join("\n");
}

export async function refineTaskCardsWithGemini(
  input: RefineTaskCardsWithGeminiInput,
): Promise<TaskCardRefinement[]> {
  if (input.drafts.length === 0) return [];

  const response = await analyzeWithGemini(
    {
      contents: [
        {
          role: "user",
          parts: [{ text: buildTaskCardRefinementPrompt(input) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: getTaskCardRefinementJsonSchema(),
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 1400,
      },
    },
    { signal: input.signal, timeout: 25000 },
  );

  return parseTaskCardRefinementFromGeminiResponse(response.data);
}

export interface ExtractChecksFromDetailTextInput {
  cropName: string;
  operationName: string;
  detailText: string;
  signal?: AbortSignal;
}

const extractChecksSchema = z.object({
  checks: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
});

export async function extractChecksFromDetailText(
  input: ExtractChecksFromDetailTextInput,
): Promise<string[]> {
  const prompt = [
    "당신은 농업 현장 작업카드 편집 보조입니다.",
    `작물 '${input.cropName}'의 '${input.operationName}' 작업에 대한 상세 설명을 읽고, 농부가 밭에서 당장 실행할 수 있는 체크리스트(최대 5개, 각 60자 이내)로 추출하세요.`,
    "반드시 JSON 객체만 출력하세요. markdown, 설명문은 금지합니다.",
    "JSON 형식: {\"checks\":[\"\"]}",
    "상세 설명:",
    input.detailText,
  ].join("\n");

  try {
    const response = await analyzeWithGemini(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 600,
        },
      },
      { signal: input.signal, timeout: 15000 },
    );

    const jsonText = stripFence(response.data.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    if (!jsonText) return [];

    const data = JSON.parse(jsonText);
    const result = extractChecksSchema.parse(data);
    return result.checks;
  } catch {
    return [];
  }
}
