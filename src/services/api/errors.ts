import { EdgeInvokeError } from "@/services/edgeInvoke";
import type { ExternalApiSource } from "@/services/api/types";

export type ApiAdapterErrorCode =
  | "edge_http_error"
  | "edge_fetch_error"
  | "edge_relay_error"
  | "edge_invoke_error"
  | "upstream_error"
  | "invalid_payload"
  | "unknown_error";

interface ApiAdapterErrorOptions {
  source: ExternalApiSource;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

export class ApiAdapterError extends Error {
  readonly source: ExternalApiSource;
  readonly code: ApiAdapterErrorCode | string;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(message: string, options: ApiAdapterErrorOptions) {
    super(message);
    this.name = "ApiAdapterError";
    this.source = options.source;
    this.code = options.code ?? "unknown_error";
    this.details = options.details;
    this.cause = options.cause;
  }
}

function normalizeEdgeCode(code: string | undefined): ApiAdapterErrorCode | string {
  if (!code) return "edge_invoke_error";
  if (code === "FunctionsFetchError") return "edge_fetch_error";
  if (code === "FunctionsRelayError") return "edge_relay_error";
  if (code.includes("upstream")) return "upstream_error";
  return code;
}

export function toApiAdapterError(error: unknown, source: ExternalApiSource): ApiAdapterError {
  if (error instanceof ApiAdapterError) return error;

  if (error instanceof EdgeInvokeError) {
    return new ApiAdapterError(error.message, {
      source,
      code: normalizeEdgeCode(error.code),
      details: error.details,
      cause: error,
    });
  }

  if (error instanceof Error) {
    return new ApiAdapterError(error.message, {
      source,
      code: "unknown_error",
      cause: error,
    });
  }

  return new ApiAdapterError("외부 API 어댑터 처리 중 알 수 없는 오류가 발생했습니다.", {
    source,
    code: "unknown_error",
    details: error,
  });
}

export function toInvalidPayloadError(error: unknown, source: ExternalApiSource): ApiAdapterError {
  return new ApiAdapterError(error instanceof Error ? error.message : "외부 API 응답 형식이 올바르지 않습니다.", {
    source,
    code: "invalid_payload",
    cause: error,
  });
}
