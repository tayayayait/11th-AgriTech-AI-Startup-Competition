import { invokeEdgeFunction } from "@/services/edgeInvoke";
import { toApiAdapterError } from "@/services/api/errors";
import type { ApiInvokeOptions, ExternalApiSource } from "@/services/api/types";

export async function invokeApiAdapter<TResponse, TRequest>(
  source: ExternalApiSource,
  functionName: string,
  body: TRequest,
  options?: ApiInvokeOptions,
): Promise<TResponse> {
  try {
    return await invokeEdgeFunction<TResponse, TRequest>(functionName, body, options);
  } catch (error) {
    throw toApiAdapterError(error, source);
  }
}

