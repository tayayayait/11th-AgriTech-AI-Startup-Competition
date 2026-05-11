export interface NongsaroCropSearchProfile {
  canonicalName: string;
  workScheduleGroupNames: string[];
  weeklyKeywords: string[];
  pestKeywords: string[];
  relatedKeywords: string[];
}

interface CropMappingEntry {
  canonicalName: string;
  aliases: string[];
  workScheduleGroupNames: string[];
  weeklyKeywords: string[];
  pestKeywords: string[];
  relatedKeywords?: string[];
}

export const MAJOR_NONGSARO_CROP_NAMES = [
  "벼",
  "배추",
  "무",
  "고추",
  "마늘",
  "양파",
  "감자",
  "고구마",
  "콩",
  "옥수수",
  "사과",
  "배",
  "복숭아",
  "포도",
  "딸기",
  "토마토",
] as const;

const CROP_MAPPING_ENTRIES: CropMappingEntry[] = [
  {
    canonicalName: "벼",
    aliases: ["벼", "쌀", "논벼", "수도작"],
    workScheduleGroupNames: ["논농사"],
    weeklyKeywords: ["벼", "논농사", "쌀"],
    pestKeywords: ["벼", "논농사", "수도작"],
  },
  {
    canonicalName: "배추",
    aliases: ["배추", "김장배추"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["배추", "김장채소", "채소"],
    pestKeywords: ["배추", "채소"],
  },
  {
    canonicalName: "무",
    aliases: ["무", "무우", "김장무"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["무", "김장채소", "채소"],
    pestKeywords: ["무", "채소"],
  },
  {
    canonicalName: "고추",
    aliases: ["고추", "풋고추", "홍고추", "건고추"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["고추", "채소"],
    pestKeywords: ["고추", "채소"],
  },
  {
    canonicalName: "마늘",
    aliases: ["마늘"],
    workScheduleGroupNames: ["채소", "밭농사"],
    weeklyKeywords: ["마늘", "채소", "밭농사"],
    pestKeywords: ["마늘", "채소"],
  },
  {
    canonicalName: "양파",
    aliases: ["양파"],
    workScheduleGroupNames: ["채소", "밭농사"],
    weeklyKeywords: ["양파", "채소", "밭농사"],
    pestKeywords: ["양파", "채소"],
  },
  {
    canonicalName: "감자",
    aliases: ["감자", "봄감자", "고랭지감자"],
    workScheduleGroupNames: ["밭농사"],
    weeklyKeywords: ["감자", "밭농사"],
    pestKeywords: ["감자", "밭농사"],
  },
  {
    canonicalName: "고구마",
    aliases: ["고구마"],
    workScheduleGroupNames: ["밭농사"],
    weeklyKeywords: ["고구마", "밭농사"],
    pestKeywords: ["고구마", "밭농사"],
  },
  {
    canonicalName: "콩",
    aliases: ["콩", "대두"],
    workScheduleGroupNames: ["밭농사"],
    weeklyKeywords: ["콩", "밭농사"],
    pestKeywords: ["콩", "밭농사"],
  },
  {
    canonicalName: "옥수수",
    aliases: ["옥수수", "찰옥수수"],
    workScheduleGroupNames: ["밭농사"],
    weeklyKeywords: ["옥수수", "밭농사"],
    pestKeywords: ["옥수수", "밭농사"],
  },
  {
    canonicalName: "사과",
    aliases: ["사과"],
    workScheduleGroupNames: ["과수"],
    weeklyKeywords: ["사과", "과수"],
    pestKeywords: ["사과", "과수"],
  },
  {
    canonicalName: "배",
    aliases: ["배", "신고배"],
    workScheduleGroupNames: ["과수"],
    weeklyKeywords: ["배", "과수"],
    pestKeywords: ["배", "과수"],
  },
  {
    canonicalName: "복숭아",
    aliases: ["복숭아", "복사", "피치"],
    workScheduleGroupNames: ["과수"],
    weeklyKeywords: ["복숭아", "과수"],
    pestKeywords: ["복숭아", "과수"],
  },
  {
    canonicalName: "포도",
    aliases: ["포도"],
    workScheduleGroupNames: ["과수"],
    weeklyKeywords: ["포도", "과수"],
    pestKeywords: ["포도", "과수"],
  },
  {
    canonicalName: "딸기",
    aliases: ["딸기"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["딸기", "채소"],
    pestKeywords: ["딸기", "채소"],
  },
  {
    canonicalName: "토마토",
    aliases: ["토마토", "방울토마토"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["토마토", "채소"],
    pestKeywords: ["토마토", "채소"],
  },
  {
    canonicalName: "오이",
    aliases: ["오이"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["오이", "채소"],
    pestKeywords: ["오이", "채소"],
  },
  {
    canonicalName: "상추",
    aliases: ["상추"],
    workScheduleGroupNames: ["채소"],
    weeklyKeywords: ["상추", "채소"],
    pestKeywords: ["상추", "채소"],
  },
  {
    canonicalName: "인삼",
    aliases: ["인삼"],
    workScheduleGroupNames: ["약초"],
    weeklyKeywords: ["인삼", "약초"],
    pestKeywords: ["인삼", "약초"],
  },
  {
    canonicalName: "버섯",
    aliases: ["버섯", "느타리", "표고", "양송이"],
    workScheduleGroupNames: ["버섯"],
    weeklyKeywords: ["버섯"],
    pestKeywords: ["버섯"],
  },
];

const normalizeSearchText = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

const uniqueNonEmpty = (values: string[]): string[] => {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }
  return result;
};

const findMappingEntry = (cropName: string): CropMappingEntry | null => {
  const normalizedCrop = normalizeSearchText(cropName);
  if (!normalizedCrop) return null;

  const aliasPairs = CROP_MAPPING_ENTRIES.flatMap((entry) =>
    entry.aliases.map((alias) => ({ entry, alias, normalizedAlias: normalizeSearchText(alias) })),
  );

  const exact = aliasPairs.find((pair) => pair.normalizedAlias === normalizedCrop);
  if (exact) return exact.entry;

  const partial = aliasPairs
    .filter((pair) => pair.normalizedAlias.length >= 2)
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)
    .find((pair) => normalizedCrop.includes(pair.normalizedAlias));

  return partial?.entry ?? null;
};

export const getNongsaroCropSearchProfile = (cropName: string): NongsaroCropSearchProfile => {
  const trimmed = cropName.trim();
  if (!trimmed) {
    return {
      canonicalName: "",
      workScheduleGroupNames: [],
      weeklyKeywords: [],
      pestKeywords: [],
      relatedKeywords: [],
    };
  }

  const entry = findMappingEntry(trimmed);
  if (!entry) {
    return {
      canonicalName: trimmed,
      workScheduleGroupNames: [trimmed],
      weeklyKeywords: [trimmed],
      pestKeywords: [trimmed],
      relatedKeywords: [trimmed],
    };
  }

  return {
    canonicalName: entry.canonicalName,
    workScheduleGroupNames: uniqueNonEmpty(entry.workScheduleGroupNames),
    weeklyKeywords: uniqueNonEmpty(entry.weeklyKeywords),
    pestKeywords: uniqueNonEmpty(entry.pestKeywords),
    relatedKeywords: uniqueNonEmpty([
      entry.canonicalName,
      ...entry.aliases,
      ...entry.workScheduleGroupNames,
      ...entry.weeklyKeywords,
      ...entry.pestKeywords,
      ...(entry.relatedKeywords ?? []),
    ]),
  };
};

export const nongsaroTextMatchesKeywords = (value: string, keywords: string[]): boolean => {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword.length > 0 && normalizedValue.includes(normalizedKeyword);
  });
};
