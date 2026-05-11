import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";
import { getNongsaroCropSearchProfile } from "@/domain/nongsaro/cropMapping";
import {
  getKstDateKey,
  isDateWithinWeeklyFarmInfoPeriod,
  parseWeeklyFarmInfoPeriod,
} from "@/domain/nongsaro/weeklyFarmInfo";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { fetchNongsaro } from "@/services/nongsaroClient";
import { isWeeklyFarmInfoPersistenceMissing } from "@/services/weeklyFarmInfoPersistenceError";

export type WeeklyFarmSummaryStatus = "pending" | "ready" | "failed";

export interface NongsaroWeeklyInfo {
  id: string | null;
  sourceKey: string;
  title: string;
  publishedAt: string | null;
  writer: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  sourceUrl: string | null;
  downUrlList: string[];
  sourceFileName: string | null;
  hitCount: number | null;
  summaryStatus: WeeklyFarmSummaryStatus;
  summaryText: string | null;
  summaryPayload: Json | null;
  isCurrent: boolean;
  isNew: boolean;
}

type WeeklyFarmInfoRow = Tables<"weekly_farm_infos">;
let weeklyFarmInfoPersistenceAvailable = true;

interface WeeklyFarmInfoApiItem {
  sourceKey: string;
  subject: string;
  writerNm: string | null;
  regDt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  hitCt: number | null;
  downUrl: string | null;
  downUrlList: string[];
  fileName: string | null;
}

const toCleanString = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseNumber = (value: string | null | undefined): number | null => {
  const trimmed = toCleanString(value);
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDateKey = (value: string | null | undefined): string | null => {
  const trimmed = toCleanString(value);
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})\.?$/);
  if (!match) return trimmed;

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeUrlList = (item: Record<string, string>, primaryUrl: string | null): string[] => {
  const rawList = toCleanString(item.downUrlList);
  const values = rawList ? rawList.split(/[\n,]+/) : [];
  const urls = values
    .map((value) => normalizeNongsaroUrl(value))
    .filter((value): value is string => Boolean(value));

  if (primaryUrl && !urls.includes(primaryUrl)) urls.unshift(primaryUrl);
  return urls;
};

const buildSourceKey = (input: {
  subject: string;
  regDt: string | null;
  fileName: string | null;
  downUrl: string | null;
}): string => {
  if (input.downUrl) return `url:${input.downUrl}`;
  return `meta:${[input.subject, input.regDt ?? "", input.fileName ?? ""].join("|")}`;
};

const toSummaryStatus = (value: string | null | undefined): WeeklyFarmSummaryStatus => {
  if (value === "ready" || value === "failed") return value;
  return "pending";
};

function normalizeWeeklyItem(item: Record<string, string>): WeeklyFarmInfoApiItem | null {
  const title = (item.subject ?? "").trim();
  if (!title) return null;
  const period = parseWeeklyFarmInfoPeriod(title);
  const downUrl = normalizeNongsaroUrl(item.downUrl ?? null);
  const fileName = toCleanString(item.fileName);
  const regDt = normalizeDateKey(item.regDt);

  return {
    sourceKey: buildSourceKey({ subject: title, regDt, fileName, downUrl }),
    subject: title,
    writerNm: toCleanString(item.writerNm),
    regDt,
    periodStart: period?.periodStart ?? null,
    periodEnd: period?.periodEnd ?? null,
    hitCt: parseNumber(item.hitCt),
    downUrl,
    downUrlList: normalizeUrlList(item, downUrl),
    fileName,
  };
}

async function fetchWeeklyRaw(subject?: string): Promise<WeeklyFarmInfoApiItem[]> {
  const response = await fetchNongsaro("weekFarmInfo", "weekFarmInfoList", {
    ...(subject ? { subject } : {}),
    pageNo: 1,
    numOfRows: 10,
  });
  return response.items
    .map(normalizeWeeklyItem)
    .filter((item): item is WeeklyFarmInfoApiItem => item !== null);
}

const dedupeApiItems = (items: WeeklyFarmInfoApiItem[]): WeeklyFarmInfoApiItem[] => {
  const byKey = new Map<string, WeeklyFarmInfoApiItem>();
  for (const item of items) byKey.set(item.sourceKey, item);
  return Array.from(byKey.values());
};

const toInsertPayload = (item: WeeklyFarmInfoApiItem): TablesInsert<"weekly_farm_infos"> => ({
  source_key: item.sourceKey,
  subject: item.subject,
  writer_nm: item.writerNm,
  reg_dt: item.regDt,
  period_start: item.periodStart,
  period_end: item.periodEnd,
  hit_ct: item.hitCt,
  down_url: item.downUrl,
  down_url_list: item.downUrlList as unknown as Json,
  file_name: item.fileName,
});

const getExistingSourceKeys = async (sourceKeys: string[]): Promise<Set<string>> => {
  if (sourceKeys.length === 0) return new Set();

  const { data, error } = await supabase
    .from("weekly_farm_infos")
    .select("source_key")
    .in("source_key", sourceKeys);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.source_key));
};

const syncWeeklyFarmInfoRows = async (
  apiItems: WeeklyFarmInfoApiItem[],
): Promise<Set<string>> => {
  const uniqueItems = dedupeApiItems(apiItems);
  if (uniqueItems.length === 0) return new Set();

  const sourceKeys = uniqueItems.map((item) => item.sourceKey);
  const existingKeys = await getExistingSourceKeys(sourceKeys);
  const { error } = await supabase
    .from("weekly_farm_infos")
    .upsert(uniqueItems.map(toInsertPayload), { onConflict: "source_key" });

  if (error) throw error;
  return new Set(sourceKeys.filter((sourceKey) => !existingKeys.has(sourceKey)));
};

const toStringArray = (value: Json): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const mapWeeklyInfoRow = (
  row: WeeklyFarmInfoRow,
  todayKey: string,
  newSourceKeys: Set<string>,
): NongsaroWeeklyInfo => ({
  id: row.id,
  sourceKey: row.source_key,
  title: row.subject,
  publishedAt: row.reg_dt,
  writer: row.writer_nm,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  sourceUrl: row.down_url,
  downUrlList: toStringArray(row.down_url_list),
  sourceFileName: row.file_name,
  hitCount: row.hit_ct,
  summaryStatus: toSummaryStatus(row.summary_status),
  summaryText: row.summary_text,
  summaryPayload: row.summary_payload,
  isCurrent: isDateWithinWeeklyFarmInfoPeriod(
    todayKey,
    row.period_start && row.period_end
      ? { periodStart: row.period_start, periodEnd: row.period_end }
      : null,
  ),
  isNew: newSourceKeys.has(row.source_key),
});

const mapApiItemToWeeklyInfo = (
  item: WeeklyFarmInfoApiItem,
  todayKey: string,
): NongsaroWeeklyInfo => ({
  id: null,
  sourceKey: item.sourceKey,
  title: item.subject,
  publishedAt: item.regDt,
  writer: item.writerNm,
  periodStart: item.periodStart,
  periodEnd: item.periodEnd,
  sourceUrl: item.downUrl,
  downUrlList: item.downUrlList,
  sourceFileName: item.fileName,
  hitCount: item.hitCt,
  summaryStatus: "pending",
  summaryText: null,
  summaryPayload: null,
  isCurrent: isDateWithinWeeklyFarmInfoPeriod(
    todayKey,
    item.periodStart && item.periodEnd
      ? { periodStart: item.periodStart, periodEnd: item.periodEnd }
      : null,
  ),
  isNew: false,
});

const getFallbackWeeklyInfos = (
  apiItems: WeeklyFarmInfoApiItem[],
  todayKey: string,
): NongsaroWeeklyInfo[] => {
  const infos = dedupeApiItems(apiItems).map((item) => mapApiItemToWeeklyInfo(item, todayKey));
  const currentInfos = infos.filter((item) => item.isCurrent);
  return (currentInfos.length > 0 ? currentInfos : infos).slice(0, 7);
};

const getCurrentWeeklyRows = async (
  todayKey: string,
  newSourceKeys: Set<string>,
): Promise<NongsaroWeeklyInfo[]> => {
  const { data, error } = await supabase
    .from("weekly_farm_infos")
    .select("*")
    .lte("period_start", todayKey)
    .gte("period_end", todayKey)
    .order("period_start", { ascending: false })
    .order("reg_dt", { ascending: false })
    .limit(7);

  if (error) throw error;
  return (data ?? []).map((row) => mapWeeklyInfoRow(row, todayKey, newSourceKeys));
};

const getRecentWeeklyRows = async (
  todayKey: string,
  newSourceKeys: Set<string>,
): Promise<NongsaroWeeklyInfo[]> => {
  const { data, error } = await supabase
    .from("weekly_farm_infos")
    .select("*")
    .order("period_start", { ascending: false })
    .order("reg_dt", { ascending: false })
    .limit(7);

  if (error) throw error;
  return (data ?? []).map((row) => mapWeeklyInfoRow(row, todayKey, newSourceKeys));
};

const collectWeeklyApiItems = async (cropName: string): Promise<WeeklyFarmInfoApiItem[]> => {
  const keyword = cropName.trim();
  if (!keyword) return fetchWeeklyRaw();

  const profile = getNongsaroCropSearchProfile(keyword);
  const collected: WeeklyFarmInfoApiItem[] = [];
  for (const subject of profile.weeklyKeywords) {
    const matches = await fetchWeeklyRaw(subject);
    collected.push(...matches);
    if (matches.length > 0) break;
  }

  collected.push(...await fetchWeeklyRaw());
  return collected;
};

export async function getWeeklyFarmInfos(cropName: string, today = new Date()): Promise<NongsaroWeeklyInfo[]> {
  const apiItems = await collectWeeklyApiItems(cropName);
  const todayKey = getKstDateKey(today);
  if (!weeklyFarmInfoPersistenceAvailable) {
    return getFallbackWeeklyInfos(apiItems, todayKey);
  }

  try {
    const newSourceKeys = await syncWeeklyFarmInfoRows(apiItems);
    const currentRows = await getCurrentWeeklyRows(todayKey, newSourceKeys);
    if (currentRows.length > 0) return currentRows.slice(0, 7);

    return (await getRecentWeeklyRows(todayKey, newSourceKeys)).slice(0, 7);
  } catch (error) {
    if (!isWeeklyFarmInfoPersistenceMissing(error)) throw error;
    weeklyFarmInfoPersistenceAvailable = false;
    return getFallbackWeeklyInfos(apiItems, todayKey);
  }
}
