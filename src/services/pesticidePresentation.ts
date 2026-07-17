export interface PesticideProductMedia {
  brandName: string;
  imageUrl: string;
  productPageUrl: string;
  sourceLabel: string;
}

export interface PesticideQuickSummaryInput {
  cropName: string;
  targetName: string;
  plainUse: string;
  safetyNote: string;
}

const PRODUCT_MEDIA_CATALOG: PesticideProductMedia[] = [
  {
    brandName: "레빅사",
    imageUrl: "https://www.30agro.co.kr/uploaded/board/product/t1_69aaab47d479943156c8cbe6ca75d88a0.png",
    productPageUrl: "https://www.30agro.co.kr/crop_protection_agent/crop_protection_agent_view.php?idx=138",
    sourceLabel: "한국삼공 공식 제품 이미지",
  },
  {
    brandName: "다이센엠45",
    imageUrl: "https://www.farmhannong.com/files/products/2026/2/202602120453374010.png",
    productPageUrl: "https://www.farmhannong.com/kor/product/product_ct01/view.do?seq=4952",
    sourceLabel: "팜한농 공식 제품 이미지",
  },
  {
    brandName: "팜한농캡탄",
    imageUrl: "https://www.farmhannong.com/files/products/2026/2/202602270117252360.png",
    productPageUrl: "https://www.farmhannong.com/kor/product/product_ct01/view.do?seq=4285",
    sourceLabel: "팜한농 공식 제품 이미지",
  },
];

const normalizeBrandName = (value: string): string =>
  value.replace(/[\s\-_()（）·]/g, "").toLowerCase();

export function resolvePesticideProductMedia(brandNames: string[]): PesticideProductMedia | null {
  const candidates = brandNames.map(normalizeBrandName).filter(Boolean);
  return PRODUCT_MEDIA_CATALOG.find((media) => candidates.includes(normalizeBrandName(media.brandName))) ?? null;
}

export function buildPesticideQuickSummary(input: PesticideQuickSummaryInput): string {
  const cropName = input.cropName.trim();
  const targetName = input.targetName.trim();
  const plainUse = input.plainUse.trim();
  const safetyNote = input.safetyNote.trim();
  return `이 농약은 ${cropName}의 ${targetName} 방제에 등록된 제품입니다. ${plainUse} ${safetyNote}`.trim();
}
