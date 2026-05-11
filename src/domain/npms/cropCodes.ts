export interface NpmsCropProfile {
  cropCode: string;
  cropName: string;
}

interface NpmsCropEntry extends NpmsCropProfile {
  aliases: string[];
}

const NPMS_CROP_ENTRIES: NpmsCropEntry[] = [
  { cropCode: "FC010101", cropName: "논벼", aliases: ["논", "벼", "논벼", "쌀", "수도작", "논농사"] },
  { cropCode: "VC010803", cropName: "토마토", aliases: ["토마토", "방울토마토"] },
  { cropCode: "VC010801", cropName: "수박", aliases: ["수박", "수박밭"] },
  { cropCode: "VC011205", cropName: "고추", aliases: ["고추", "풋고추", "홍고추", "건고추"] },
  { cropCode: "VC019998", cropName: "파프리카", aliases: ["파프리카"] },
  { cropCode: "VC021001", cropName: "배추", aliases: ["배추", "김장배추"] },
  { cropCode: "VC031101", cropName: "무", aliases: ["무", "무우", "김장무"] },
  { cropCode: "VC041209", cropName: "마늘", aliases: ["마늘"] },
  { cropCode: "VC041201", cropName: "양파", aliases: ["양파"] },
  { cropCode: "FC050501", cropName: "감자", aliases: ["감자", "봄감자", "고랭지감자"] },
  { cropCode: "FC050502", cropName: "고구마", aliases: ["고구마"] },
  { cropCode: "FC030301", cropName: "콩", aliases: ["콩", "대두"] },
  { cropCode: "FC040401", cropName: "옥수수", aliases: ["옥수수", "찰옥수수"] },
  { cropCode: "IC011602", cropName: "들깨", aliases: ["들깨", "깻잎", "들깻잎"] },
  { cropCode: "FT010601", cropName: "사과", aliases: ["사과"] },
  { cropCode: "FT010602", cropName: "배", aliases: ["배", "신고배"] },
  { cropCode: "FT020604", cropName: "복숭아", aliases: ["복숭아", "복숭아나무", "복숭아밭"] },
  { cropCode: "FT040603", cropName: "포도", aliases: ["포도"] },
  { cropCode: "VC010804", cropName: "딸기", aliases: ["딸기"] },
];

function normalizeCropText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function resolveNpmsCropProfile(cropName: string): NpmsCropProfile | null {
  const normalizedCrop = normalizeCropText(cropName);
  if (!normalizedCrop) return null;

  const exact = NPMS_CROP_ENTRIES.find((entry) =>
    entry.aliases.some((alias) => normalizeCropText(alias) === normalizedCrop),
  );
  if (exact) return { cropCode: exact.cropCode, cropName: exact.cropName };

  const partial = NPMS_CROP_ENTRIES
    .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias: normalizeCropText(alias) })))
    .filter((item) => item.alias.length >= 2)
    .sort((a, b) => b.alias.length - a.alias.length)
    .find((item) => normalizedCrop.includes(item.alias));

  return partial ? { cropCode: partial.entry.cropCode, cropName: partial.entry.cropName } : null;
}
