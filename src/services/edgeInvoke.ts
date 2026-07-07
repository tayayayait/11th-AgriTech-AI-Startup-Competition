import { supabase } from "@/integrations/supabase/client";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

interface EdgeErrorPayload {
  error?: string;
  code?: string;
  details?: unknown;
}

interface InvokeEdgeFunctionOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export class EdgeInvokeError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "EdgeInvokeError";
    this.code = options?.code;
    this.details = options?.details;
  }
}

function parseEdgeErrorPayload(payload: unknown): EdgeInvokeError | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as EdgeErrorPayload;
  if (typeof candidate.error !== "string") return null;

  return new EdgeInvokeError(candidate.error, {
    code: candidate.code,
    details: candidate.details,
  });
}

export async function invokeEdgeFunction<TResponse, TRequest>(
  functionName: string,
  body: TRequest,
  options?: InvokeEdgeFunctionOptions,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      "Content-Type": "application/json",
    },
    signal: options?.signal,
    timeout: options?.timeout,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response;
      let payload: unknown = null;
      try {
        payload = await response.clone().json();
      } catch {
        try {
          payload = await response.clone().text();
        } catch {
          payload = null;
        }
      }

      const parsed = parseEdgeErrorPayload(payload);
      if (parsed) throw parsed;

      throw new EdgeInvokeError(error.message, {
        code: "edge_http_error",
        details: payload,
      });
    }

    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      throw new EdgeInvokeError(error.message, {
        code: error.name,
        details: error.context ?? null,
      });
    }

    const context = (error as { context?: unknown }).context;
    throw new EdgeInvokeError(error.message, { details: context ?? null, code: "edge_invoke_error" });
  }

  const maybeError = parseEdgeErrorPayload(data);
  if (maybeError) throw maybeError;

  return data as TResponse;
}
