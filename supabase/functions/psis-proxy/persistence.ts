import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPsisCatalogRows,
  type PsisCatalogServiceCode,
} from "./catalog.ts";

type RequestParams = Record<string, string | number | boolean | null | undefined>;
type JsonRecord = Record<string, unknown>;

export interface PersistPsisCatalogInput {
  serviceCode: PsisCatalogServiceCode;
  params: RequestParams;
  service: JsonRecord;
  fetchedAt: string;
  startedAt: string;
}

export type PsisCatalogCacheResult =
  | {
    status: "stored";
    products: number;
    registrations: number;
    skipped: number;
  }
  | {
    status: "failed";
  };

function sourceItemCount(serviceCode: PsisCatalogServiceCode, service: JsonRecord): number {
  if (serviceCode === "SVC02") return 1;
  if (Array.isArray(service.list)) return service.list.length;
  return service.list && typeof service.list === "object" ? 1 : 0;
}

function jsonParams(params: RequestParams): JsonRecord {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (typeof error === "string") return error.slice(0, 1000);
  return "Unknown catalog persistence error.";
}

async function insertSyncRun(
  client: SupabaseClient,
  input: PersistPsisCatalogInput,
  values: {
    status: "succeeded" | "partial" | "failed";
    sourceItemCount: number;
    productCount: number;
    registrationCount: number;
    skippedCount: number;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const { error } = await client.from("psis_pesticide_sync_runs").insert({
    service_code: input.serviceCode,
    trigger_type: "api_request",
    status: values.status,
    request_params: jsonParams(input.params),
    source_item_count: values.sourceItemCount,
    product_count: values.productCount,
    registration_count: values.registrationCount,
    skipped_count: values.skippedCount,
    error_code: values.errorCode ?? null,
    error_message: values.errorMessage ?? null,
    started_at: input.startedAt,
    completed_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function persistPsisCatalog(
  client: SupabaseClient,
  input: PersistPsisCatalogInput,
): Promise<PsisCatalogCacheResult> {
  const rows = buildPsisCatalogRows(input);
  const itemCount = sourceItemCount(input.serviceCode, input.service);

  try {
    if (rows.products.length > 0) {
      const { error } = await client
        .from("psis_pesticide_products")
        .upsert(rows.products, { onConflict: "pesti_code" });
      if (error) throw error;
    }

    if (rows.registrations.length > 0) {
      const { error } = await client
        .from("psis_pesticide_registrations")
        .upsert(rows.registrations, {
          onConflict: "pesti_code,disease_use_seq",
        });
      if (error) throw error;
    }

    await insertSyncRun(client, input, {
      status: rows.skippedCount > 0 ? "partial" : "succeeded",
      sourceItemCount: itemCount,
      productCount: rows.products.length,
      registrationCount: rows.registrations.length,
      skippedCount: rows.skippedCount,
    });

    return {
      status: "stored",
      products: rows.products.length,
      registrations: rows.registrations.length,
      skipped: rows.skippedCount,
    };
  } catch (error) {
    const message = errorMessage(error);
    console.error("[psis-proxy] catalog persistence failed", message);

    try {
      await insertSyncRun(client, input, {
        status: "failed",
        sourceItemCount: itemCount,
        productCount: 0,
        registrationCount: 0,
        skippedCount: rows.skippedCount,
        errorCode: "catalog_persistence_failed",
        errorMessage: message,
      });
    } catch (syncRunError) {
      console.error(
        "[psis-proxy] failed to record catalog sync failure",
        errorMessage(syncRunError),
      );
    }

    return { status: "failed" };
  }
}
