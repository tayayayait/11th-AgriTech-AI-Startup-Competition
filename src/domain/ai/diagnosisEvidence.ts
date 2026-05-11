import type { DiagnosisOfficialSource, DiagnosisResult } from "@/domain/ai/diagnosis";

export interface DiagnosisEvidenceSource {
  sourceId: string;
  title: string;
  publishedAt: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
}

const OFFICIAL_SOURCE_CHECK = "농사로 공식 발생정보 원문 확인";

const normalizeSearchText = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

const tokenizeCandidateName = (name: string): string[] => {
  const normalized = normalizeSearchText(name)
    .replace(/의심|후보|가능성|확인|권고/g, "")
    .trim();
  if (!normalized) return [];

  const tokens = normalized
    .split(/[,/·(){}:;|]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  return Array.from(new Set([normalized, ...tokens]));
};

const toOfficialSource = (
  source: DiagnosisEvidenceSource,
  matchReason: string,
): DiagnosisOfficialSource => ({
  sourceId: source.sourceId,
  title: source.title,
  publishedAt: source.publishedAt,
  attachmentUrl: source.attachmentUrl,
  matchReason,
});

const matchSourcesForCandidate = (
  candidateName: string,
  sources: DiagnosisEvidenceSource[],
): DiagnosisOfficialSource[] => {
  const tokens = tokenizeCandidateName(candidateName);
  if (tokens.length === 0) return [];

  return sources
    .filter((source) => {
      const title = normalizeSearchText(source.title);
      return tokens.some((token) => title.includes(token));
    })
    .map((source) => toOfficialSource(source, "후보명 직접 일치"))
    .slice(0, 3);
};

const fallbackSources = (sources: DiagnosisEvidenceSource[]): DiagnosisOfficialSource[] =>
  sources.slice(0, 2).map((source) => toOfficialSource(source, "작물 공식 발생정보 fallback"));

const mergeChecklist = (fieldChecklist: string[], hasSources: boolean): string[] => {
  if (!hasSources || fieldChecklist.includes(OFFICIAL_SOURCE_CHECK)) {
    return fieldChecklist;
  }

  return [OFFICIAL_SOURCE_CHECK, ...fieldChecklist].slice(0, 7);
};

export const attachOfficialSourcesToDiagnosisResult = (
  result: DiagnosisResult,
  sources: DiagnosisEvidenceSource[],
): DiagnosisResult => {
  const hasSources = sources.length > 0;

  return {
    ...result,
    candidates: result.candidates.map((candidate) => {
      const matched = matchSourcesForCandidate(candidate.name, sources);
      return {
        ...candidate,
        officialSources: matched.length > 0 ? matched : fallbackSources(sources),
      };
    }),
    fieldChecklist: mergeChecklist(result.fieldChecklist, hasSources),
  };
};
