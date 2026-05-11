import { analyzeWithGemini } from "@/services/geminiClient";
import type {
  WeeklyFarmBriefingFieldContext,
  WeeklyFarmBriefingWeatherContext,
} from "@/services/weeklyFarmBriefingService";
import { z } from "zod";

export const AI_WEEKLY_ALTERNATIVE_MODEL = "gemini-3-flash-preview";

export interface WeeklyFarmAlternativeSource {
  name: string;
  url: string | null;
}

export interface WeeklyFarmAlternativeBriefing {
  headline: string;
  summaryBullets: string[];
  actionBullets: string[];
  cautionBullets: string[];
  evidenceSources: WeeklyFarmAlternativeSource[];
}

export interface GenerateWeeklyFarmAlternativeBriefingInput {
  cropName: string;
  field?: WeeklyFarmBriefingFieldContext | null;
  weather?: WeeklyFarmBriefingWeatherContext | null;
  today?: Date;
  signal?: AbortSignal;
}

const alternativeBulletSchema = z.array(z.string().trim().min(1).max(180)).min(1).max(5);

const weeklyFarmAlternativeBriefingSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  summaryBullets: alternativeBulletSchema,
  actionBullets: alternativeBulletSchema,
  cautionBullets: alternativeBulletSchema,
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
    throw new Error("Gemini weekly alternative briefing JSON parse failed.");
  }
}

function extractGeminiJson(responseData: unknown): unknown {
  if (!responseData || typeof responseData !== "object") {
    throw new Error("Gemini weekly alternative briefing response is empty.");
  }

  const source = responseData as Record<string, unknown>;
  if ("headline" in source) return source;

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

  throw new Error("Gemini weekly alternative briefing JSON was not found.");
}

export function getWeeklyFarmAlternativeBriefingJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      headline: { type: "string" },
      summaryBullets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      actionBullets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      cautionBullets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    },
    required: ["headline", "summaryBullets", "actionBullets", "cautionBullets"],
  };
}

export function parseWeeklyFarmAlternativeBriefingFromGeminiResponse(
  responseData: unknown,
): Omit<WeeklyFarmAlternativeBriefing, "evidenceSources"> {
  const payload = extractGeminiJson(responseData);
  const parsed = weeklyFarmAlternativeBriefingSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Gemini weekly alternative briefing JSON schema mismatch.");
  }

  return parsed.data;
}

function formatKstDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function compactContext(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item === undefined || item === "") return null;
    return item;
  });
}

export function buildWeeklyFarmAlternativeBriefingPrompt(
  input: GenerateWeeklyFarmAlternativeBriefingInput,
): string {
  const cropName = input.cropName.trim() || "선택 작물";
  const today = formatKstDate(input.today ?? new Date());
  const fieldContext = input.field
    ? compactContext({
      name: input.field.name ?? null,
      address: input.field.address ?? null,
      growthStage: input.field.growthStage ?? null,
      areaM2: input.field.areaM2 ?? null,
    })
    : "null";
  const weatherContext = input.weather
    ? compactContext({
      sourceStatus: input.weather.sourceStatus ?? null,
      precipitation: input.weather.precipitation ?? null,
      temperature: input.weather.temperature ?? null,
      wind: input.weather.wind ?? null,
      humidity: input.weather.humidity ?? null,
      riskSummary: input.weather.riskSummary ?? null,
    })
    : "null";

  return [
    "당신은 한국 농가용 농사 브리핑을 작성하는 보조 AI입니다.",
    "상황: 공식 주간농사정보 PDF에서 selected_crop 직접 근거가 확인되지 않았습니다.",
    "따라서 모델 내부 농업 지식과 제공된 필지/기상 맥락만으로 참고 브리핑을 작성합니다.",
    "이 브리핑은 공식 주간농사정보 근거가 아니므로 headline 또는 summaryBullets에 반드시 'AI 참고'를 포함하세요.",
    "이번 주라는 표현은 기준일의 월/계절과 제공된 기상 맥락에 따른 일반 점검 의미로만 사용하세요.",
    "최신 지역 예찰, 품종별 세부 기준, 농약 등록사항처럼 실시간 확인이 필요한 내용은 확정하지 마세요.",
    "농약명, 희석배수, 수확 전 사용일수, 제품명, 법정 안전사용기준은 절대 생성하지 마세요.",
    "병해충 발생을 확정 진단하지 말고 가능성/점검/확인 표현만 사용하세요.",
    "근거가 부족하면 추측하지 말고 '확실한 정보 없음'이라고 쓰세요.",
    "모든 JSON 문자열은 한국어로 작성하세요.",
    "반드시 JSON 객체만 출력하세요. markdown, 코드블록, 설명문은 금지합니다.",
    `selected_crop: ${cropName}`,
    `kst_today: ${today}`,
    `registered_field: ${fieldContext}`,
    `weather_context: ${weatherContext}`,
  ].join("\n");
}

export async function generateWeeklyFarmAlternativeBriefing(
  input: GenerateWeeklyFarmAlternativeBriefingInput,
): Promise<WeeklyFarmAlternativeBriefing> {
  const response = await analyzeWithGemini(
    {
      model: AI_WEEKLY_ALTERNATIVE_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: buildWeeklyFarmAlternativeBriefingPrompt(input) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: getWeeklyFarmAlternativeBriefingJsonSchema(),
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 1600,
      },
    },
    { signal: input.signal, timeout: 20000 },
  );

  return {
    ...parseWeeklyFarmAlternativeBriefingFromGeminiResponse(response.data),
    evidenceSources: [
      {
        name: "AI 내부 지식 기반 참고(공식 주간농사정보 근거 없음)",
        url: null,
      },
    ],
  };
}
