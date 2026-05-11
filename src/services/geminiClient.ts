import { invokeApiAdapter } from "@/services/api/edgeAdapter";
import type { ApiAdapterResponse, ApiInvokeOptions } from "@/services/api/types";

interface GeminiProxyRequest {
  model?: string;
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  safetySettings?: unknown[];
  tools?: unknown[];
  systemInstruction?: unknown;
}

export interface GeminiProxyResponse extends ApiAdapterResponse<unknown, "gemini"> {
  source: "gemini";
  model: string;
  fetchedAt: string;
}

export async function analyzeWithGemini(
  request: GeminiProxyRequest | string,
  options?: ApiInvokeOptions,
): Promise<GeminiProxyResponse> {
  const payload: GeminiProxyRequest = typeof request === "string"
    ? {
        contents: [
          {
            role: "user",
            parts: [{ text: request }],
          },
        ],
      }
    : request;
  return invokeApiAdapter<GeminiProxyResponse, GeminiProxyRequest>("gemini", "gemini-proxy", payload, options);
}
