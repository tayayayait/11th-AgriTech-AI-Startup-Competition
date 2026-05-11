import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";
import { normalizeHtmlText } from "@/domain/text/html";
import { getNongsaroCropSearchProfile } from "@/domain/nongsaro/cropMapping";
import { fetchNongsaro } from "@/services/nongsaroClient";

export interface NongsaroWorkScheduleEra {
  operationName: string;
  farmWorkFlag: string | null;
  beginMonth: number | null;
  endMonth: number | null;
  beginEra: string | null;
  endEra: string | null;
  requiredMonth: number | null;
  infoType: string | null;
  videoUrl: string | null;
}

export interface NongsaroWorkScheduleInfo {
  sourceId: string;
  title: string;
  cropName: string;
  groupCode: string;
  detailText: string | null;
  fileName: string | null;
  fileUrl: string | null;
  eras: NongsaroWorkScheduleEra[];
}

export type NongsaroWorkScheduleLookupStatus =
  | "empty-keyword"
  | "group-match-failed"
  | "schedule-match-failed"
  | "schedule-found";

export interface NongsaroWorkScheduleGroup {
  cropName: string;
  groupCode: string;
  sort: number | null;
}

export interface NongsaroWorkScheduleLookup {
  cropName: string;
  canonicalName: string;
  matchedGroup: NongsaroWorkScheduleGroup | null;
  searchedGroups: NongsaroWorkScheduleGroup[];
  allScheduleCount: number;
  matchedScheduleCount: number;
  schedules: NongsaroWorkScheduleInfo[];
  status: NongsaroWorkScheduleLookupStatus;
}

interface WorkScheduleListCandidate {
  group: NongsaroWorkScheduleGroup;
  item: Record<string, string>;
}

function toNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: string | undefined | null): string | null {
  const text = (value ?? "").trim();
  return text || null;
}

function normalizeGroup(item: Record<string, string>): NongsaroWorkScheduleGroup | null {
  const cropName = (item.codeNm ?? "").trim();
  const groupCode = (item.kidofcomdtySeCode ?? "").trim();
  if (!cropName || !groupCode) return null;
  return {
    cropName,
    groupCode,
    sort: toNumber(item.sort),
  };
}

function matchesCrop(group: NongsaroWorkScheduleGroup, cropName: string): boolean {
  const normalizedCrop = cropName.replace(/\s+/g, "").toLowerCase();
  const normalizedGroup = group.cropName.replace(/\s+/g, "").toLowerCase();
  if (!normalizedCrop || !normalizedGroup) return false;
  return normalizedCrop.includes(normalizedGroup) || normalizedGroup.includes(normalizedCrop);
}

function scheduleMatchRank(schedule: NongsaroWorkScheduleInfo, cropName: string): number {
  const normalizedCrop = cropName.replace(/\s+/g, "").toLowerCase();
  if (!normalizedCrop) return 1;

  const searchable = `${schedule.cropName} ${schedule.title}`.replace(/\s+/g, "").toLowerCase();
  return searchable.includes(normalizedCrop) ? 0 : 1;
}

function normalizeMatchText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function scheduleTitle(item: Record<string, string>): string {
  return (item.sj ?? item.cntntsSj ?? "").trim();
}

function itemTitleMatchesCrop(item: Record<string, string>, cropName: string, canonicalName: string): boolean {
  const normalizedTitle = normalizeMatchText(scheduleTitle(item));
  if (!normalizedTitle) return false;

  return [cropName, canonicalName]
    .map(normalizeMatchText)
    .filter((value) => value.length >= 1)
    .some((value) => normalizedTitle.includes(value));
}

function findMappedGroup(groups: NongsaroWorkScheduleGroup[], cropName: string): NongsaroWorkScheduleGroup | null {
  const profile = getNongsaroCropSearchProfile(cropName);

  for (const groupName of profile.workScheduleGroupNames) {
    const matched = groups.find((group) => matchesCrop(group, groupName));
    if (matched) return matched;
  }

  return groups.find((group) => matchesCrop(group, cropName)) ?? null;
}

function stripHtml(value: string | undefined): string | null {
  return normalizeHtmlText(value);
}

function normalizeScheduleItem(
  item: Record<string, string>,
  group: NongsaroWorkScheduleGroup,
  detailText: string | null,
  eras: NongsaroWorkScheduleEra[],
): NongsaroWorkScheduleInfo | null {
  const sourceId = (item.cntntsNo ?? "").trim();
  const title = (item.sj ?? item.cntntsSj ?? "").trim();
  if (!sourceId || !title) return null;

  return {
    sourceId,
    title,
    cropName: group.cropName,
    groupCode: group.groupCode,
    detailText,
    fileName: (item.fileName ?? item.orginlFileNm ?? "").trim() || null,
    fileUrl: normalizeNongsaroUrl(item.fileDownUrlInfo ?? null),
    eras,
  };
}

function normalizeScheduleEra(item: Record<string, string>): NongsaroWorkScheduleEra | null {
  const operationName = normalizeHtmlText(item.opertNm);
  if (!operationName) return null;

  return {
    operationName,
    farmWorkFlag: toText(item.farmWorkFlag),
    beginMonth: toNumber(item.beginMon),
    endMonth: toNumber(item.endMon),
    beginEra: toText(item.beginEra),
    endEra: toText(item.endEra),
    requiredMonth: toNumber(item.reqreMonth),
    infoType: toText(item.infoSeCodeNm),
    videoUrl: normalizeNongsaroUrl(item.vodUrl ?? null),
  };
}

async function fetchWorkScheduleGroups(): Promise<NongsaroWorkScheduleGroup[]> {
  const response = await fetchNongsaro("farmWorkingPlanNew", "workScheduleGrpList");
  return response.items
    .map(normalizeGroup)
    .filter((item): item is WorkScheduleGroup => item !== null)
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));
}

async function fetchScheduleDetail(sourceId: string): Promise<string | null> {
  try {
    const detailResponse = await fetchNongsaro("farmWorkingPlanNew", "workScheduleDtl", {
      cntntsNo: sourceId,
    });
    const detailText = stripHtml(detailResponse.items.map((item) => item.cn).filter(Boolean).join("\n"));
    if (detailText) return detailText;
  } catch {
    // 시기 HTML 상세로 보완한다.
  }

  try {
    const eraResponse = await fetchNongsaro("farmWorkingPlanNew", "workScheduleEraInfoLst", {
      cntntsNo: sourceId,
    });
    return stripHtml(eraResponse.items.map((item) => item.htmlCn).filter(Boolean).join("\n"));
  } catch {
    return null;
  }
}

async function fetchScheduleEras(sourceId: string): Promise<NongsaroWorkScheduleEra[]> {
  const response = await fetchNongsaro("farmWorkingPlanNew", "workScheduleEraInfoJsonLst", {
    cntntsNo: sourceId,
  });

  return response.items
    .map(normalizeScheduleEra)
    .filter((item): item is NongsaroWorkScheduleEra => item !== null);
}

async function fetchScheduleCandidatesForGroup(
  group: NongsaroWorkScheduleGroup,
): Promise<WorkScheduleListCandidate[]> {
  const listResponse = await fetchNongsaro("farmWorkingPlanNew", "workScheduleLst", {
    kidofcomdtySeCode: group.groupCode,
  });

  return listResponse.items
    .filter((item) => item.cntntsNo && scheduleTitle(item))
    .map((item) => ({ group, item }));
}

function emptyLookup(
  cropName: string,
  canonicalName: string,
  status: NongsaroWorkScheduleLookupStatus,
  matchedGroup: NongsaroWorkScheduleGroup | null = null,
  searchedGroups: NongsaroWorkScheduleGroup[] = [],
  allScheduleCount = 0,
): NongsaroWorkScheduleLookup {
  return {
    cropName,
    canonicalName,
    matchedGroup,
    searchedGroups,
    allScheduleCount,
    matchedScheduleCount: 0,
    schedules: [],
    status,
  };
}

export async function getWorkScheduleLookupForCrop(cropName: string): Promise<NongsaroWorkScheduleLookup> {
  const keyword = cropName.trim();
  if (!keyword) return emptyLookup("", "", "empty-keyword");

  const profile = getNongsaroCropSearchProfile(keyword);
  const groups = await fetchWorkScheduleGroups();
  const matchedGroup = findMappedGroup(groups, keyword);
  const searchedGroups = matchedGroup ? [matchedGroup] : groups;
  if (searchedGroups.length === 0) {
    return emptyLookup(keyword, profile.canonicalName, "group-match-failed");
  }

  const candidateGroups = await Promise.all(searchedGroups.map(fetchScheduleCandidatesForGroup));
  const allScheduleItems = candidateGroups.flat();
  const matchedScheduleItems = allScheduleItems
    .filter(({ item }) => itemTitleMatchesCrop(item, keyword, profile.canonicalName));
  const scheduleItems = matchedScheduleItems
    .slice(0, 5);
  if (scheduleItems.length === 0) {
    return emptyLookup(
      keyword,
      profile.canonicalName,
      "schedule-match-failed",
      matchedGroup,
      searchedGroups,
      allScheduleItems.length,
    );
  }

  const scheduleDetails = await Promise.all(
    scheduleItems.map(async ({ item }) => {
      const sourceId = item.cntntsNo ?? "";
      try {
        const [detailText, eras] = await Promise.all([
          fetchScheduleDetail(sourceId).catch(() => null),
          fetchScheduleEras(sourceId).catch(() => []),
        ]);
        return { detailText, eras };
      } catch {
        return { detailText: null, eras: [] };
      }
    }),
  );

  const schedules = scheduleItems
    .map(({ group, item }, index) =>
      normalizeScheduleItem(
        item,
        group,
        scheduleDetails[index]?.detailText ?? null,
        scheduleDetails[index]?.eras ?? [],
      ),
    )
    .filter((item): item is NongsaroWorkScheduleInfo => item !== null)
    .sort((a, b) => scheduleMatchRank(a, keyword) - scheduleMatchRank(b, keyword));

  return {
    cropName: keyword,
    canonicalName: profile.canonicalName,
    matchedGroup,
    searchedGroups,
    allScheduleCount: allScheduleItems.length,
    matchedScheduleCount: matchedScheduleItems.length,
    schedules,
    status: schedules.length > 0 ? "schedule-found" : "schedule-match-failed",
  };
}

export async function getWorkSchedulesForCrop(cropName: string): Promise<NongsaroWorkScheduleInfo[]> {
  const lookup = await getWorkScheduleLookupForCrop(cropName);
  return lookup.schedules;
}
