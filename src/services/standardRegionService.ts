import type { StandardRegionCodeRow } from "@/domain/standardRegion/types";
import { dedupeStandardRegionRows, standardRegionSortKey } from "@/domain/standardRegion/standardRegion";
import { ApiAdapterError } from "@/services/api/errors";
import type { ApiRequestParams } from "@/services/api/types";
import { fetchStandardRegionCodes, type StandardRegionApiResponse } from "@/services/standardRegionClient";

const PAGE_SIZE = 1000;
const MAX_PAGES = 30;
const MIN_REQUEST_INTERVAL_MS = 100;
const RATE_LIMIT_RETRY_DELAY_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 2;

interface StandardRegionPaginationOptions {
  minRequestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function containsPerSecondRateLimitSignal(value: unknown): boolean {
  if (typeof value === "string") {
    return value.includes("REQUESTS_PER_SECOND_EXCEEDS_ERROR")
      || /<returnReasonCode>\s*23\s*<\/returnReasonCode>/i.test(value);
  }
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(([key, entry]) => (
    (key === "returnReasonCode" && String(entry) === "23")
    || containsPerSecondRateLimitSignal(entry)
  ));
}

function isPerSecondRateLimitError(error: unknown): boolean {
  if (!(error instanceof ApiAdapterError) || !["upstream_error", "standard_region_upstream_error"].includes(error.code)) {
    return false;
  }
  return containsPerSecondRateLimitSignal(error.details);
}

async function fetchPageWithRateLimitRetry(
  params: ApiRequestParams,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<StandardRegionApiResponse> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      return await fetchStandardRegionCodes(params);
    } catch (error) {
      if (!isPerSecondRateLimitError(error) || attempt === MAX_RATE_LIMIT_RETRIES) throw error;
      await sleep(RATE_LIMIT_RETRY_DELAY_MS * 2 ** attempt);
    }
  }

  throw new Error("Standard region page retry exhausted.");
}

export async function getAllStandardRegionCodes(
  options: StandardRegionPaginationOptions = {},
): Promise<StandardRegionCodeRow[]> {
  const minRequestIntervalMs = Math.max(0, options.minRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS);
  const sleep = options.sleep ?? wait;
  const firstPage = await fetchPageWithRateLimitRetry({
    pageNo: 1,
    numOfRows: PAGE_SIZE,
    flag: "Y",
  }, sleep);

  const totalCount = firstPage.data.totalCount;
  if (totalCount === null || totalCount <= PAGE_SIZE) {
    return dedupeStandardRegionRows(firstPage.data.rows).sort((a, b) =>
      standardRegionSortKey(a).localeCompare(standardRegionSortKey(b)),
    );
  }

  const totalPages = Math.min(Math.ceil(totalCount / PAGE_SIZE), MAX_PAGES);
  const restPages: StandardRegionApiResponse[] = [];

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    await sleep(minRequestIntervalMs);
    restPages.push(await fetchPageWithRateLimitRetry({
      pageNo,
      numOfRows: PAGE_SIZE,
      flag: "Y",
    }, sleep));
  }

  const rows = [firstPage, ...restPages].flatMap((response) => response.data.rows);

  return dedupeStandardRegionRows(rows).sort((a, b) => standardRegionSortKey(a).localeCompare(standardRegionSortKey(b)));
}
