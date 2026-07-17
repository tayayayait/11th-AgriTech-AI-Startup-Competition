export interface OfficialPesticideSource {
  sourceLabel: string;
  companyPatterns: string[];
  hosts: string[];
}

const OFFICIAL_PESTICIDE_SOURCES: OfficialPesticideSource[] = [
  {
    sourceLabel: "경농 공식 제품",
    companyPatterns: ["경농"],
    hosts: ["knco.co.kr"],
  },
  {
    sourceLabel: "농협케미컬 공식 제품",
    companyPatterns: ["농협케미컬"],
    hosts: ["nhchemical.com"],
  },
  {
    sourceLabel: "동방아그로 공식 제품",
    companyPatterns: ["동방아그로"],
    hosts: ["dongbangagro.co.kr"],
  },
  {
    sourceLabel: "바이엘크롭사이언스 공식 제품",
    companyPatterns: ["바이엘크롭사이언스", "바이엘"],
    hosts: ["cropscience.bayer.co.kr"],
  },
  {
    sourceLabel: "성보화학 공식 제품",
    companyPatterns: ["성보화학"],
    hosts: ["sbcc.kr"],
  },
  {
    sourceLabel: "신젠타코리아 공식 제품",
    companyPatterns: ["신젠타코리아", "신젠타"],
    hosts: ["syngenta.co.kr"],
  },
  {
    sourceLabel: "팜한농 공식 제품",
    companyPatterns: ["팜한농"],
    hosts: ["farmhannong.com"],
  },
  {
    sourceLabel: "한국삼공 공식 제품",
    companyPatterns: ["한국삼공"],
    hosts: ["30agro.co.kr"],
  },
  {
    sourceLabel: "선문그린사이언스 공식 제품",
    companyPatterns: ["선문그린사이언스"],
    hosts: ["smgs.kr"],
  },
  {
    sourceLabel: "인바이오 공식 제품",
    companyPatterns: ["인바이오"],
    hosts: ["enbio.co.kr"],
  },
  {
    sourceLabel: "한얼싸이언스 공식 제품",
    companyPatterns: ["한얼싸이언스"],
    hosts: ["hescience.co.kr"],
  },
  {
    sourceLabel: "누보 공식 제품",
    companyPatterns: ["누보"],
    hosts: ["nousbo.com"],
  },
  {
    sourceLabel: "대유 공식 제품",
    companyPatterns: ["대유"],
    hosts: ["dae-yu.co.kr"],
  },
  {
    sourceLabel: "아그리젠토 공식 제품",
    companyPatterns: ["아그리젠토"],
    hosts: ["agrigento.or.kr"],
  },
  {
    sourceLabel: "아다마코리아 공식 제품",
    companyPatterns: ["아다마코리아", "아다마"],
    hosts: ["adama.com"],
  },
  {
    sourceLabel: "ISK바이오사이언스코리아 공식 제품",
    companyPatterns: ["ISK바이오사이언스코리아", "ISK바이오사이언스"],
    hosts: ["iskbio.co.kr"],
  },
  {
    sourceLabel: "유원에코사이언스 공식 제품",
    companyPatterns: ["유원에코사이언스"],
    hosts: ["yweco.com"],
  },
  {
    sourceLabel: "유일 공식 제품",
    companyPatterns: ["유일"],
    hosts: ["yooill.co.kr"],
  },
  {
    sourceLabel: "장유산업 공식 제품",
    companyPatterns: ["장유산업"],
    hosts: ["agrox.co.kr"],
  },
  {
    sourceLabel: "케이씨생명과학 공식 제품",
    companyPatterns: ["케이씨생명과학"],
    hosts: ["kcbio.co.kr"],
  },
  {
    sourceLabel: "천지인바이오텍 공식 제품",
    companyPatterns: ["천지인바이오텍"],
    hosts: ["chunjiinbt.com"],
  },
  {
    sourceLabel: "태준아그로텍 공식 제품",
    companyPatterns: ["태준아그로텍"],
    hosts: ["taejun.co.kr"],
  },
];

export function normalizeProductLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\(\s*주\s*\)|주식회사|㈜/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function isAllowedHost(hostname: string, allowedHost: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedHost.toLowerCase().replace(/\.$/, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function resolveOfficialPesticideSource(
  companyName: string,
  url: URL,
): OfficialPesticideSource | null {
  if (url.protocol !== "https:") return null;
  const normalizedCompany = normalizeProductLabel(companyName);

  return OFFICIAL_PESTICIDE_SOURCES.find((source) => {
    const companyMatches = source.companyPatterns.some((pattern) =>
      normalizedCompany.includes(normalizeProductLabel(pattern))
    );
    const hostMatches = source.hosts.some((host) => isAllowedHost(url.hostname, host));
    return companyMatches && hostMatches;
  }) ?? null;
}
