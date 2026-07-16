import { normalizeNongsaroUrl } from "@/domain/nongsaro/common";
import { getNongsaroCropSearchProfile } from "@/domain/nongsaro/cropMapping";
import { fetchNongsaro } from "@/services/nongsaroClient";

export interface CropEbookVideo {
  videoTitle: string;
  videoOriginInstt: string | null;
  videoLink: string;
  videoImg: string | null;
}

export interface CropEbookVideoLookup {
  cropName: string;
  canonicalName: string;
  subCategoryCode: string | null;
  subCategoryName: string | null;
  videos: CropEbookVideo[];
}

export interface CropEbookVideoLookupOptions {
  numOfRows?: number;
  maxPages?: number;
}

export interface CropEbookTechInfo {
  title: string;
  videoUrl?: string;
  summary?: string;
  sourceUrl?: string;
}

interface MainCategory {
  code: string;
  name: string;
}

interface MiddleCategory {
  code: string;
  name: string;
}

interface SubCategory {
  code: string;
  name: string;
}

const DEFAULT_NUM_OF_ROWS = 20;
const DEFAULT_MAX_PAGES = 3;

const clean = (value: string | null | undefined): string => (value ?? "").trim();

const normalizeSearchText = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

function toMainCategory(item: Record<string, string>): MainCategory | null {
  const code = clean(item.mainCategoryCode);
  const name = clean(item.mainCategoryNm);
  return code && name ? { code, name } : null;
}

function toMiddleCategory(item: Record<string, string>): MiddleCategory | null {
  const code = clean(item.middleCategoryCode);
  const name = clean(item.middleCategoryNm);
  return code && name ? { code, name } : null;
}

function toSubCategory(item: Record<string, string>): SubCategory | null {
  const code = clean(item.subCategoryCode);
  const name = clean(item.subCategoryNm);
  return code && name ? { code, name } : null;
}

function normalizeMaybeUrl(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (!raw) return null;

  try {
    const url = new URL(raw, "https://www.nongsaro.go.kr");
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return normalizeNongsaroUrl(raw);
  }
}

function normalizeVideo(item: Record<string, string>): CropEbookVideo | null {
  const title = clean(item.videoTitle);
  const link = normalizeMaybeUrl(item.videoLink);
  if (!title || !link) return null;

  return {
    videoTitle: title,
    videoOriginInstt: clean(item.videoOriginInstt) || null,
    videoLink: link,
    videoImg: normalizeMaybeUrl(item.videoImg),
  };
}

async function fetchMainCategories(): Promise<MainCategory[]> {
  const response = await fetchNongsaro("cropEbook", "mainCategoryList");
  return response.items.map(toMainCategory).filter((item): item is MainCategory => item !== null);
}

async function fetchMiddleCategories(mainCategoryCode: string): Promise<MiddleCategory[]> {
  const response = await fetchNongsaro("cropEbook", "middleCategoryList", { mainCategoryCode });
  return response.items.map(toMiddleCategory).filter((item): item is MiddleCategory => item !== null);
}

async function fetchSubCategories(middleCategoryCode: string, keyword: string): Promise<SubCategory[]> {
  const response = await fetchNongsaro("cropEbook", "subCategoryList", {
    middleCategoryCode,
    ...(keyword ? { subCategoryNm: keyword } : {}),
  });
  return response.items.map(toSubCategory).filter((item): item is SubCategory => item !== null);
}

function subCategoryMatches(subCategory: SubCategory, keywords: string[]): boolean {
  const name = normalizeSearchText(subCategory.name);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword && (name.includes(normalizedKeyword) || normalizedKeyword.includes(name));
  });
}

async function findSubCategoryForCrop(cropName: string): Promise<{
  profileName: string;
  subCategory: SubCategory | null;
}> {
  const profile = getNongsaroCropSearchProfile(cropName);
  const keywords = [profile.canonicalName, ...profile.relatedKeywords, cropName]
    .map((value) => value.trim())
    .filter(Boolean);
  const mainCategories = await fetchMainCategories();

  for (const mainCategory of mainCategories) {
    const middleCategories = await fetchMiddleCategories(mainCategory.code);
    for (const middleCategory of middleCategories) {
      for (const keyword of keywords) {
        const filtered = await fetchSubCategories(middleCategory.code, keyword);
        const exact = filtered.find((item) => subCategoryMatches(item, keywords));
        if (exact) return { profileName: profile.canonicalName || cropName, subCategory: exact };
        if (filtered.length > 0) return { profileName: profile.canonicalName || cropName, subCategory: filtered[0] };
      }
    }
  }

  return { profileName: profile.canonicalName || cropName, subCategory: null };
}

function dedupeVideos(videos: CropEbookVideo[]): CropEbookVideo[] {
  const byKey = new Map<string, CropEbookVideo>();
  for (const video of videos) {
    const key = video.videoLink || video.videoTitle;
    if (!byKey.has(key)) byKey.set(key, video);
  }
  return Array.from(byKey.values());
}

async function fetchVideosForSubCategory(
  subCategoryCode: string,
  options: Required<CropEbookVideoLookupOptions>,
): Promise<CropEbookVideo[]> {
  const videos: CropEbookVideo[] = [];

  for (let pageNo = 1; pageNo <= options.maxPages; pageNo += 1) {
    const response = await fetchNongsaro("cropEbook", "videoList", {
      subCategoryCode,
      pageNo,
      numOfRows: options.numOfRows,
    });
    const pageVideos = response.items
      .map(normalizeVideo)
      .filter((item): item is CropEbookVideo => item !== null);
    videos.push(...pageVideos);

    if (response.items.length < options.numOfRows) break;
  }

  return dedupeVideos(videos).slice(0, options.numOfRows * options.maxPages);
}

export async function getCropEbookVideosForCrop(
  cropName: string,
  options: CropEbookVideoLookupOptions = {},
): Promise<CropEbookVideoLookup> {
  const keyword = cropName.trim();
  const resolvedOptions = {
    numOfRows: options.numOfRows ?? DEFAULT_NUM_OF_ROWS,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
  };
  if (!keyword) {
    return {
      cropName: "",
      canonicalName: "",
      subCategoryCode: null,
      subCategoryName: null,
      videos: [],
    };
  }

  const { profileName, subCategory } = await findSubCategoryForCrop(keyword);
  if (!subCategory) {
    return {
      cropName: keyword,
      canonicalName: profileName,
      subCategoryCode: null,
      subCategoryName: null,
      videos: [],
    };
  }

  const videos = await fetchVideosForSubCategory(subCategory.code, resolvedOptions);
  return {
    cropName: keyword,
    canonicalName: profileName,
    subCategoryCode: subCategory.code,
    subCategoryName: subCategory.name,
    videos,
  };
}

export async function getCropEbookTechInfo(
  cropName: string,
  options: CropEbookVideoLookupOptions = {},
): Promise<CropEbookTechInfo[]> {
  const result = await getCropEbookVideosForCrop(cropName, options);
  return result.videos.map((video) => ({
    title: video.videoTitle,
    videoUrl: video.videoLink,
    summary: video.videoOriginInstt ?? undefined,
    sourceUrl: video.videoLink,
  }));
}
