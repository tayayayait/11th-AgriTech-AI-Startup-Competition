import {
  createLimitedDiagnosisResult,
  getDiagnosisResponseJsonSchema,
  MARKETABILITY_CHECK_GUIDANCE,
  NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION,
  NO_VISIBLE_SYMPTOM_LIMITATION,
  parseDiagnosisFromGeminiResponse,
  type DiagnosisResult,
} from "@/domain/ai/diagnosis";
import { analyzeWithGemini } from "@/services/geminiClient";
import { getNpmsPhotoDiagnosisReferences, type NpmsDiagnosisReference } from "@/services/npmsPestService";

interface DiagnosisFileInput {
  mimeType: string;
  data: string;
}

interface RunDiagnosisInput {
  bodyPart: string;
  candidateReferences?: NpmsDiagnosisReference[];
  cropName: string;
  files: DiagnosisFileInput[];
  onCandidateReferences?: (references: NpmsDiagnosisReference[]) => void;
  signal?: AbortSignal;
}

const DIAGNOSIS_MAX_OUTPUT_TOKENS = [1200, 1800];
const PHOTO_DIAGNOSIS_REFERENCE_LIMIT = 16;
const FALLBACK_REFERENCE_MATCH_THRESHOLD = 10;

type PlantPartKey = "leaf" | "fruit" | "stem" | "root" | "flower";

interface AppearanceMatchGroup {
  name: string;
  appearanceTerms: string[];
  referenceTerms: string[];
  weight: number;
  check: string;
}

interface ScoredDiagnosisReference {
  reference: NpmsDiagnosisReference;
  score: number;
  matchedGroups: string[];
  matchedTerms: string[];
}

interface PlantPartDefinition {
  key: PlantPartKey;
  terms: string[];
}

interface RankedDiagnosisReference {
  index: number;
  scored: ScoredDiagnosisReference;
  requestedPartScore: number;
  competingPartScore: number;
  referenceParts: Set<PlantPartKey>;
}

const PLANT_PART_DEFINITIONS: PlantPartDefinition[] = [
  {
    key: "leaf",
    terms: ["잎", "엽", "엽면", "엽맥", "엽병", "엽육", "엽신", "엽록", "잎맥", "잎자루", "leaf", "leaves", "foliar"],
  },
  {
    key: "fruit",
    terms: [
      "열매",
      "과실",
      "과일",
      "과면",
      "과피",
      "과육",
      "과경",
      "꼭지",
      "송이",
      "착과",
      "열과",
      "과방",
      "과립",
      "fruit",
      "fruits",
      "berry",
      "berries",
    ],
  },
  {
    key: "stem",
    terms: ["줄기", "가지", "신초", "수간", "주간", "수피", "피목", "목질부", "stem", "stems", "branch", "branches", "shoot"],
  },
  {
    key: "root",
    terms: ["뿌리", "근부", "근권", "근경", "root", "roots"],
  },
  {
    key: "flower",
    terms: ["꽃", "화기", "개화", "꽃잎", "화방", "flower", "flowers", "blossom", "bloom"],
  },
];

const APPEARANCE_MATCH_GROUPS: AppearanceMatchGroup[] = [
  {
    name: "곰팡이",
    appearanceTerms: ["곰팡", "솜털", "균사", "회색", "잿빛", "흰가루"],
    referenceTerms: ["곰팡", "잿빛", "균사", "포자", "분생", "흰가루", "노균"],
    weight: 4,
    check: "곰팡이 색상, 솜털 형태, 표면 확산 범위를 가까이 확인하세요.",
  },
  {
    name: "부패/썩음",
    appearanceTerms: ["부패", "썩", "물러", "무름"],
    referenceTerms: ["부패", "썩", "무름", "물러"],
    weight: 4,
    check: "부패가 과실 표면인지 꼭지/과경 주변인지 확인하세요.",
  },
  {
    name: "병반/무늬",
    appearanceTerms: ["반점", "병반", "무늬", "점무늬"],
    referenceTerms: ["반점", "병반", "무늬", "점무늬", "반문"],
    weight: 3,
    check: "병반의 색, 테두리, 중심부 함몰 여부를 확인하세요.",
  },
  {
    name: "변색",
    appearanceTerms: ["변색", "갈변", "갈색", "흑갈", "검게", "황화", "노랗"],
    referenceTerms: ["변색", "갈변", "갈색", "흑갈", "황화", "괴저", "검게"],
    weight: 2,
    check: "변색 부위가 번지는지, 마른 병반인지, 물러진 부패인지 구분하세요.",
  },
  {
    name: "시듦/마름",
    appearanceTerms: ["시듦", "시들", "마름", "마른", "위조"],
    referenceTerms: ["시들", "마름", "마른", "위조", "고사"],
    weight: 2,
    check: "마른 부위가 잎, 줄기, 과실 중 어디에서 시작됐는지 확인하세요.",
  },
  {
    name: "상처/터짐",
    appearanceTerms: ["상처", "터짐", "찢", "균열", "갈라"],
    referenceTerms: ["상처", "터짐", "균열", "열과", "갈라"],
    weight: 2,
    check: "상처가 물리적 손상인지 병반 주변 균열인지 확인하세요.",
  },
  {
    name: "해충 피해",
    appearanceTerms: ["해충", "벌레", "충", "갉", "구멍", "흡즙", "배설"],
    referenceTerms: ["해충", "충", "벌레", "유충", "성충", "가해", "흡즙", "갉", "구멍", "배설"],
    weight: 4,
    check: "잎 뒷면, 과실 표면, 줄기 주변에서 벌레·알·배설물 흔적을 확인하세요.",
  },
];

function kindLabel(reference: NpmsDiagnosisReference): string {
  return reference.kind === "disease" ? "병" : "해충";
}

function summarizeReference(reference: NpmsDiagnosisReference, index: number): string {
  const sections = reference.sections
    .slice(0, 5)
    .map((section) => `${section.title}: ${section.content.slice(0, 300)}`)
    .join(" / ");

  return [
    `${index + 1}. candidateId=${reference.id}`,
    `name=${reference.name}`,
    `kind=${reference.kind === "disease" ? "병" : "해충"}`,
    `category=${reference.category}`,
    sections ? `sections=${sections}` : "sections=확실한 정보 없음",
  ].join("; ");
}

function normalizeMatchText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeMatchText(term)));
}

function uniqueText(items: string[], maxItems: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, maxItems);
}

function buildAppearanceMatchText(appearance: DiagnosisResult["appearanceAssessment"]): string {
  return normalizeMatchText([
    ...appearance.issueLabels,
    appearance.summary,
    ...appearance.visualReasons,
  ].join(" "));
}

function buildReferenceMatchText(reference: NpmsDiagnosisReference): string {
  return normalizeMatchText([
    reference.name,
    reference.category,
    ...reference.sections.flatMap((section) => [section.title, section.content]),
  ].join(" "));
}

function hasIntersection<T>(left: Set<T>, right: Set<T>): boolean {
  for (const item of left) {
    if (right.has(item)) return true;
  }
  return false;
}

function countIntersection<T>(left: Set<T>, right: Set<T>): number {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function detectPlantParts(text: string): Set<PlantPartKey> {
  const scores = detectPlantPartScores(text);
  const parts = new Set<PlantPartKey>();
  for (const [part, score] of scores) {
    if (score > 0) parts.add(part);
  }
  return parts;
}

function countTermOccurrences(text: string, term: string): number {
  const normalizedTerm = normalizeMatchText(term);
  if (!normalizedTerm) return 0;

  let count = 0;
  let fromIndex = 0;
  while (fromIndex < text.length) {
    const index = text.indexOf(normalizedTerm, fromIndex);
    if (index < 0) break;
    count += 1;
    fromIndex = index + normalizedTerm.length;
  }
  return count;
}

function detectPlantPartScores(text: string): Map<PlantPartKey, number> {
  const normalized = normalizeMatchText(text);
  const scores = new Map<PlantPartKey, number>();
  if (!normalized) return scores;

  for (const definition of PLANT_PART_DEFINITIONS) {
    let score = 0;
    for (const term of definition.terms) {
      score += countTermOccurrences(normalized, term);
    }
    if (score > 0) scores.set(definition.key, score);
  }
  return scores;
}

function resolveRequestedPlantParts(
  bodyPart: string,
  appearance: DiagnosisResult["appearanceAssessment"],
): Set<PlantPartKey> {
  const bodyPartMatches = detectPlantParts(bodyPart);
  if (bodyPartMatches.size > 0) return bodyPartMatches;

  return detectPlantParts([
    ...appearance.issueLabels,
    appearance.summary,
    ...appearance.visualReasons,
  ].join(" "));
}

function isNonSymptomSection(title: string): boolean {
  const normalized = normalizeMatchText(title);
  return normalized.includes("방제") ||
    normalized.includes("예방") ||
    normalized.includes("약제") ||
    normalized.includes("농약") ||
    normalized.includes("처리") ||
    normalized.includes("prvn") ||
    normalized.includes("prevent") ||
    normalized.includes("전염경로") ||
    normalized.includes("전염") ||
    normalized.includes("발생생태") ||
    normalized.includes("생태정보") ||
    normalized.includes("분포정보") ||
    normalized.includes("검역");
}

/** @deprecated Use isNonSymptomSection instead. Kept for backward compatibility with Diagnosis.tsx. */
function isActionOrPreventionSection(title: string): boolean {
  return isNonSymptomSection(title);
}

function buildReferencePlantPartText(reference: NpmsDiagnosisReference): string {
  const symptomSections = reference.sections
    .filter((section) => !isNonSymptomSection(section.title))
    .flatMap((section) => [section.title, section.content]);
  const imageTexts = reference.images.flatMap((image) => [image.title, image.category ?? ""]);

  return [
    reference.name,
    reference.category,
    ...symptomSections,
    ...imageTexts,
  ].join(" ");
}

function scoreDiagnosisReference(
  appearance: DiagnosisResult["appearanceAssessment"],
  reference: NpmsDiagnosisReference,
): ScoredDiagnosisReference {
  const appearanceText = buildAppearanceMatchText(appearance);
  const referenceText = buildReferenceMatchText(reference);
  const referenceNameText = normalizeMatchText(reference.name);
  let score = 0;
  const matchedGroups: string[] = [];
  const matchedTerms: string[] = [];

  for (const group of APPEARANCE_MATCH_GROUPS) {
    if (!containsAnyTerm(appearanceText, group.appearanceTerms)) continue;

    const referenceHits = group.referenceTerms.filter((term) => referenceText.includes(normalizeMatchText(term)));
    if (!referenceHits.length) continue;

    const nameHits = referenceHits.filter((term) => referenceNameText.includes(normalizeMatchText(term)));
    score += group.weight + referenceHits.length + nameHits.length * 2;
    if (group.name === "해충 피해" && reference.kind === "insect") score += 2;
    if (group.name !== "해충 피해" && reference.kind === "disease") score += 1;

    matchedGroups.push(group.name);
    matchedTerms.push(...referenceHits);
  }

  return {
    reference,
    score,
    matchedGroups: uniqueText(matchedGroups, 4),
    matchedTerms: uniqueText(matchedTerms, 6),
  };
}

function rankDiagnosisReferencesByAppearance(
  appearance: DiagnosisResult["appearanceAssessment"],
  references: NpmsDiagnosisReference[],
): NpmsDiagnosisReference[] {
  return references
    .map((reference, index) => ({
      index,
      scored: scoreDiagnosisReference(appearance, reference),
    }))
    .sort((a, b) => b.scored.score - a.scored.score || a.index - b.index)
    .map((item) => item.scored.reference);
}

function rankDiagnosisReferencesForPhoto(
  bodyPart: string,
  appearance: DiagnosisResult["appearanceAssessment"],
  references: NpmsDiagnosisReference[],
): NpmsDiagnosisReference[] {
  const requestedParts = resolveRequestedPlantParts(bodyPart, appearance);
  if (requestedParts.size === 0) {
    return rankDiagnosisReferencesByAppearance(appearance, references);
  }

  const rankedReferences: RankedDiagnosisReference[] = references.map((reference, index) => {
    const partScores = detectPlantPartScores(buildReferencePlantPartText(reference));
    const referenceParts = new Set(partScores.keys());
    let requestedPartScore = 0;
    let competingPartScore = 0;
    for (const [part, score] of partScores) {
      if (requestedParts.has(part)) {
        requestedPartScore += score;
      } else {
        competingPartScore = Math.max(competingPartScore, score);
      }
    }
    return {
      index,
      scored: scoreDiagnosisReference(appearance, reference),
      requestedPartScore,
      competingPartScore,
      referenceParts,
    };
  });
  const MIN_REQUESTED_PART_SCORE = 3;
  const filteredReferences = rankedReferences.filter((item) =>
    item.referenceParts.size === 0 ||
    (
      hasIntersection(requestedParts, item.referenceParts) &&
      item.requestedPartScore >= MIN_REQUESTED_PART_SCORE &&
      item.requestedPartScore >= item.competingPartScore
    ),
  );

  return filteredReferences
    .sort((a, b) =>
      b.requestedPartScore - a.requestedPartScore ||
      b.scored.score - a.scored.score ||
      a.index - b.index,
    )
    .map((item) => item.scored.reference);
}

function selectFallbackReferenceMatches(
  appearance: DiagnosisResult["appearanceAssessment"],
  references: NpmsDiagnosisReference[],
): ScoredDiagnosisReference[] {
  if (appearance.status !== "abnormal") return [];

  return references
    .map((reference) => scoreDiagnosisReference(appearance, reference))
    .filter((item) => item.score >= FALLBACK_REFERENCE_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function createEvidenceFallbackResult(
  appearanceResult: DiagnosisResult,
  candidateReferences: NpmsDiagnosisReference[],
): DiagnosisResult | null {
  const matches = selectFallbackReferenceMatches(appearanceResult.appearanceAssessment, candidateReferences);
  if (!matches.length) return null;

  const checks = uniqueText(
    matches.flatMap((match) =>
      APPEARANCE_MATCH_GROUPS
        .filter((group) => match.matchedGroups.includes(group.name))
        .map((group) => group.check),
    ),
    5,
  );

  return {
    ...appearanceResult,
    candidates: matches.map((match) => ({
      sourceCandidateId: match.reference.id,
      name: match.reference.name,
      confidenceBand: "낮음",
      summary: `외관 분석과 NCPMS ${match.reference.name} 상세 증상 텍스트가 겹쳐 우선 확인 후보로 제시합니다.`,
      visualReasons: uniqueText([
        `외관 분석: ${appearanceResult.appearanceAssessment.summary}`,
        `NCPMS 일치 근거: ${match.matchedGroups.join(", ")}`,
        match.matchedTerms.length ? `겹친 표현: ${match.matchedTerms.join(", ")}` : "",
      ], 3),
      weatherReasons: [],
      nextChecks: uniqueText([
        `${match.reference.name}의 NCPMS 증상과 실제 피해 부위를 같은 위치에서 대조하세요.`,
        ...checks,
      ], 5),
      officialSources: [],
    })),
    limitations: uniqueText([
      ...appearanceResult.limitations,
      "Gemini 후보 선택이 비어 있어 외관 근거와 NCPMS 상세 증상 텍스트가 겹치는 공식 후보를 낮은 신뢰도로 제시합니다.",
    ], 5),
    recommendedPhotos: uniqueText([
      ...appearanceResult.recommendedPhotos,
      "후보와 연결되는 부위를 근접 사진과 주변 확산 사진으로 다시 촬영하세요.",
    ], 5),
    fieldChecklist: uniqueText([
      ...appearanceResult.fieldChecklist,
      MARKETABILITY_CHECK_GUIDANCE,
      "후보명과 실제 병반/부패/해충 흔적이 같은 부위에서 반복되는지 확인하세요.",
    ], 7),
  };
}

function buildAppearancePrompt(
  bodyPart: string,
  cropName: string,
  retry: boolean,
): string {
  return [
    "당신은 농업 현장 점검 보조자입니다.",
    "1차 외관 분석만 수행하세요. NCPMS, 병명 후보, 처방, 방제 지시는 다루지 마세요.",
    "사진만 보고 작물 공통 외관/상품성 이상을 평가하세요.",
    "병명/해충명을 만들지 말고 부패 의심, 곰팡이 의심, 변색, 상처/터짐, 시듦/마름, 해충 피해 흔적, 촬영 품질 제한 같은 범용 라벨만 사용하세요.",
    "외관 평가는 appearanceAssessment에 status normal|abnormal|uncertain, confidence low|medium|high, labels, summary, reasons, actions로 작성하세요.",
    "candidates는 반드시 빈 배열로 두세요.",
    "거절 설명문을 쓰지 말고 아래 JSON 형식만 반환하세요.",
    "반드시 JSON 객체만 출력하세요. markdown, 설명문, 코드블록은 금지합니다.",
    retry ? "이전 응답이 잘렸거나 JSON 파싱에 실패했습니다. 더 짧고 완전한 JSON으로 다시 작성하세요." : "",
    "JSON 형식: {\"appearanceAssessment\":{\"status\":\"normal|abnormal|uncertain\",\"confidence\":\"low|medium|high\",\"labels\":[\"\"],\"summary\":\"\",\"reasons\":[\"\"],\"actions\":[\"\"]},\"candidates\":[],\"limitations\":[\"\"],\"photos\":[\"\"],\"checklist\":[\"\"]}",
    "모르는 정보는 '확실한 정보 없음'으로 작성하세요.",
    `작물명 입력값: ${cropName || "확실한 정보 없음"}`,
    `촬영 부위 입력값: ${bodyPart || "확실한 정보 없음"}`,
  ].join("\n");
}

function buildComparisonPrompt(
  bodyPart: string,
  cropName: string,
  appearanceResult: DiagnosisResult,
  candidateReferences: NpmsDiagnosisReference[],
  retry: boolean,
): string {
  const appearance = appearanceResult.appearanceAssessment;

  return [
    "당신은 농업 현장 점검 보조자입니다.",
    "3차 비교 분석입니다. 사진과 1차 외관 분석, NCPMS 공식 후보 목록을 비교하세요.",
    "확정 진단, 처방, 방제 지시가 아니라 사진 기반 의심 후보와 현장 확인 항목만 제시하세요.",
    "제공된 NCPMS 후보 ID 안에서만 선택하세요. 목록 밖 후보 금지입니다.",
    "candidateId는 반드시 아래 NCPMS 후보 목록의 candidateId 중 하나여야 합니다.",
    "name은 후보 목록의 이름을 그대로 사용하세요. 자유롭게 병명이나 해충명을 만들지 마세요.",
    "촬영 부위와 명확히 맞지 않는 전용 후보는 후보 목록에서 제외되어 있습니다. 응답에서도 촬영 부위와 다른 전용 후보를 만들지 마세요.",
    `촬영 부위가 '${bodyPart}'입니다. 이 부위에 발생하는 병해충만 후보로 선택하세요. 예: 열매 사진이면 줄기/잎/뿌리 전용 병해충은 후보로 선택하지 마세요.`,
    "사진에서 NCPMS 후보와 연결되는 병징, 변색, 벌레, 피해 흔적이 확인되지 않으면 후보를 억지로 고르지 마세요.",
    `그 경우 candidates는 빈 배열로 두고 limitations에 '${NO_VISIBLE_SYMPTOM_LIMITATION}'를 넣으세요.`,
    "appearanceAssessment는 1차 외관 분석과 같은 의미를 유지하세요.",
    "거절 설명문을 쓰지 말고 아래 JSON 형식만 반환하세요.",
    "반드시 JSON 객체만 출력하세요. markdown, 설명문, 코드블록은 금지합니다.",
    retry ? "이전 응답이 잘렸거나 JSON 파싱에 실패했습니다. 더 짧고 완전한 JSON으로 다시 작성하세요." : "",
    "JSON 형식: {\"appearanceAssessment\":{\"status\":\"normal|abnormal|uncertain\",\"confidence\":\"low|medium|high\",\"labels\":[\"\"],\"summary\":\"\",\"reasons\":[\"\"],\"actions\":[\"\"]},\"candidates\":[{\"candidateId\":\"\",\"name\":\"\",\"confidence\":\"low|medium|high\",\"summary\":\"\",\"reasons\":[\"\"],\"checks\":[\"\"]}],\"limitations\":[\"\"],\"photos\":[\"\"],\"checklist\":[\"\"]}",
    "candidates는 최대 3개, summary/reasons/checks/checklist/photos는 각각 짧은 한국어 문장으로 작성하세요.",
    "모르는 정보는 '확실한 정보 없음'으로 작성하세요.",
    `작물명: ${cropName || "확실한 정보 없음"}`,
    `촬영 부위: ${bodyPart || "확실한 정보 없음"}`,
    "1차 외관 분석:",
    `status=${appearance.status}; confidence=${appearance.confidenceBand}; labels=${appearance.issueLabels.join(", ") || "없음"}; summary=${appearance.summary}; reasons=${appearance.visualReasons.join(" / ") || "없음"}`,
    "NCPMS 후보 목록:",
    ...candidateReferences.map(summarizeReference),
  ].join("\n");
}

function buildAiCandidateSelectionPrompt(
  bodyPart: string,
  cropName: string,
  appearanceResult: DiagnosisResult,
  candidateReferences: NpmsDiagnosisReference[],
  retry: boolean,
): string {
  const appearance = appearanceResult.appearanceAssessment;

  return [
    "AI 재판단 단계입니다. 사진, 1차 외관 분석, NCPMS 공식 후보 상세정보를 종합해서 가장 타당한 공식 후보를 고르세요.",
    "키워드 점수나 단순 문자열 포함 여부가 아니라 사진상 양상과 NCPMS 상세 증상의 의미적 유사성을 기준으로 판단하세요.",
    "후보를 고를 경우 candidateId와 name은 반드시 아래 NCPMS 후보 목록 중 하나를 그대로 사용하세요.",
    "목록 밖 병명이나 해충명은 만들 수 없습니다.",
    "촬영 부위와 명확히 맞지 않는 전용 후보는 후보 목록에서 제외되어 있습니다. 응답에서도 촬영 부위와 다른 전용 후보를 만들지 마세요.",
    `촬영 부위가 '${bodyPart}'입니다. 이 부위에 주로 나타나는 병해충만 후보로 고르세요. 다른 부위(줄기, 잎, 뿌리 등) 전용 병해충은 제외하세요.`,
    "확정 진단이 아닙니다. 사진상 양상과 공식 후보가 어느 정도 가까운지 low 또는 medium confidence로 표현하세요.",
    "사진상 외관 이상과 어떤 후보도 의미적으로 맞지 않으면 candidates는 빈 배열로 두세요.",
    "반드시 JSON 객체만 출력하세요. markdown, 설명문, 코드블록은 금지입니다.",
    retry ? "이전 응답이 잘렸거나 JSON 파싱에 실패했습니다. 더 짧고 완전한 JSON으로 다시 작성하세요." : "",
    "JSON 형식: {\"appearanceAssessment\":{\"status\":\"normal|abnormal|uncertain\",\"confidence\":\"low|medium|high\",\"labels\":[\"\"],\"summary\":\"\",\"reasons\":[\"\"],\"actions\":[\"\"]},\"candidates\":[{\"candidateId\":\"\",\"name\":\"\",\"confidence\":\"low|medium|high\",\"summary\":\"\",\"reasons\":[\"\"],\"checks\":[\"\"]}],\"limitations\":[\"\"],\"photos\":[\"\"],\"checklist\":[\"\"]}",
    `작물명: ${cropName || "확실한 정보 없음"}`,
    `촬영 부위: ${bodyPart || "확실한 정보 없음"}`,
    "1차 외관 분석:",
    `status=${appearance.status}; confidence=${appearance.confidenceBand}; labels=${appearance.issueLabels.join(", ") || "없음"}; summary=${appearance.summary}; reasons=${appearance.visualReasons.join(" / ") || "없음"}`,
    "NCPMS 후보 목록:",
    ...candidateReferences.map(summarizeReference),
  ].join("\n");
}

function hasMaxTokensFinishReason(responseData: unknown): boolean {
  if (!responseData || typeof responseData !== "object") return false;
  const candidates = (responseData as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return false;

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    return (candidate as { finishReason?: unknown }).finishReason === "MAX_TOKENS";
  });
}

function isRetryableParseError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Gemini JSON");
}

function attachNpmsOfficialSources(
  result: DiagnosisResult,
  candidateReferences: NpmsDiagnosisReference[],
): DiagnosisResult {
  const referenceById = new Map(candidateReferences.map((reference) => [reference.id, reference]));
  return {
    ...result,
    candidates: result.candidates.map((candidate) => {
      const reference = candidate.sourceCandidateId ? referenceById.get(candidate.sourceCandidateId) : null;
      if (!reference) return candidate;
      return {
        ...candidate,
        officialSources: [
          {
            sourceId: reference.id,
            title: `${reference.cropName} ${kindLabel(reference)}: ${reference.name}`,
            publishedAt: null,
            attachmentUrl: null,
            matchReason: "NCPMS 공식 도감정보",
          },
        ],
      };
    }),
  };
}

function uniqueList(items: string[], maxItems: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, maxItems);
}

function mergeAppearanceWithComparison(
  appearanceResult: DiagnosisResult,
  comparisonResult: DiagnosisResult,
): DiagnosisResult {
  return {
    ...comparisonResult,
    appearanceAssessment: appearanceResult.appearanceAssessment,
    limitations: uniqueList([...appearanceResult.limitations, ...comparisonResult.limitations], 5),
    recommendedPhotos: uniqueList([...appearanceResult.recommendedPhotos, ...comparisonResult.recommendedPhotos], 5),
    fieldChecklist: uniqueList([...appearanceResult.fieldChecklist, ...comparisonResult.fieldChecklist], 7),
  };
}

function createAppearanceOnlyResult(appearanceResult: DiagnosisResult, reason: string): DiagnosisResult {
  return {
    ...appearanceResult,
    candidates: [],
    limitations: uniqueList([...appearanceResult.limitations, reason], 5),
    recommendedPhotos: uniqueList([
      ...appearanceResult.recommendedPhotos,
      "병반, 변색, 상처, 벌레, 피해 부위가 보이도록 가까이 촬영하세요.",
    ], 5),
    fieldChecklist: uniqueList([
      ...appearanceResult.fieldChecklist,
      MARKETABILITY_CHECK_GUIDANCE,
    ], 7),
  };
}

async function analyzeDiagnosisStep(input: {
  candidateReferences?: NpmsDiagnosisReference[];
  imageParts: Array<{ inlineData: DiagnosisFileInput }>;
  prompt: (retry: boolean) => string;
  signal?: AbortSignal;
}): Promise<DiagnosisResult> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < DIAGNOSIS_MAX_OUTPUT_TOKENS.length; attempt += 1) {
    const response = await analyzeWithGemini({
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt(attempt > 0) }, ...input.imageParts],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: getDiagnosisResponseJsonSchema(),
        temperature: attempt > 0 ? 0.05 : 0.1,
        topP: 0.8,
        maxOutputTokens: DIAGNOSIS_MAX_OUTPUT_TOKENS[attempt],
      },
    }, { signal: input.signal, timeout: 35000 });

    if (hasMaxTokensFinishReason(response.data) && attempt < DIAGNOSIS_MAX_OUTPUT_TOKENS.length - 1) {
      lastError = new Error("Gemini 응답이 MAX_TOKENS로 잘렸습니다.");
      continue;
    }

    try {
      return parseDiagnosisFromGeminiResponse(response.data, input.candidateReferences);
    } catch (error) {
      lastError = error;
      if (input.signal?.aborted || !isRetryableParseError(error)) {
        throw error;
      }
      if (attempt >= DIAGNOSIS_MAX_OUTPUT_TOKENS.length - 1) {
        return createLimitedDiagnosisResult(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI 분석 결과를 파싱하지 못했습니다.");
}

async function analyzeAiCandidateSelectionFallback(input: {
  appearanceResult: DiagnosisResult;
  bodyPart: string;
  candidateReferences: NpmsDiagnosisReference[];
  cropName: string;
  imageParts: Array<{ inlineData: DiagnosisFileInput }>;
  signal?: AbortSignal;
}): Promise<DiagnosisResult | null> {
  if (input.appearanceResult.appearanceAssessment.status !== "abnormal") {
    return null;
  }

  try {
    const selectionResult = await analyzeDiagnosisStep({
      candidateReferences: input.candidateReferences,
      imageParts: input.imageParts,
      prompt: (retry) => buildAiCandidateSelectionPrompt(
        input.bodyPart,
        input.cropName,
        input.appearanceResult,
        input.candidateReferences,
        retry,
      ),
      signal: input.signal,
    });

    return selectionResult.candidates.length > 0 ? selectionResult : null;
  } catch {
    return null;
  }
}

export async function runPhotoDiagnosis(input: RunDiagnosisInput): Promise<DiagnosisResult> {
  if (!input.files.length) {
    throw new Error("분석할 사진이 없습니다.");
  }

  const imageParts = input.files.map((file) => ({
    inlineData: {
      mimeType: file.mimeType,
      data: file.data,
    },
  }));

  const appearanceResult = await analyzeDiagnosisStep({
    imageParts,
    prompt: (retry) => buildAppearancePrompt(input.bodyPart, input.cropName, retry),
    signal: input.signal,
  });

  if (appearanceResult.limitations.includes(NO_VISIBLE_SYMPTOM_EVIDENCE_LIMITATION)) {
    return appearanceResult;
  }

  let candidateReferences = input.candidateReferences ?? [];
  if (!input.candidateReferences) {
    try {
      candidateReferences = await getNpmsPhotoDiagnosisReferences(input.cropName.trim(), PHOTO_DIAGNOSIS_REFERENCE_LIMIT);
    } catch {
      input.onCandidateReferences?.([]);
      return createAppearanceOnlyResult(
        appearanceResult,
        "NCPMS 후보 조회 실패. 작물명을 확인하거나 잠시 후 다시 시도하세요.",
      );
    }
  }
  const hadCandidateReferencesBeforePartFilter = candidateReferences.length > 0;
  candidateReferences = rankDiagnosisReferencesForPhoto(
    input.bodyPart,
    appearanceResult.appearanceAssessment,
    candidateReferences,
  );
  input.onCandidateReferences?.(candidateReferences);

  if (!candidateReferences.length) {
    return createAppearanceOnlyResult(
      appearanceResult,
      hadCandidateReferencesBeforePartFilter
        ? "촬영 부위와 맞는 NCPMS 후보 없음. 촬영 부위를 확인하거나 해당 부위를 다시 촬영하세요."
        : "NCPMS 후보 없음. 작물명을 확인한 뒤 다시 시도하세요.",
    );
  }

  const comparisonResult = await analyzeDiagnosisStep({
    candidateReferences,
    imageParts,
    prompt: (retry) => buildComparisonPrompt(
      input.bodyPart,
      input.cropName,
      appearanceResult,
      candidateReferences,
      retry,
    ),
    signal: input.signal,
  });
  const aiSelectionResult = comparisonResult.candidates.length === 0
    ? await analyzeAiCandidateSelectionFallback({
      appearanceResult,
      bodyPart: input.bodyPart,
      candidateReferences,
      cropName: input.cropName,
      imageParts,
      signal: input.signal,
    })
    : null;
  // T4: 키워드 매칭 Fallback 비활성화 — Gemini의 의미적 판단을 존중합니다.
  // 이전에는 Gemini가 적절한 후보를 선택하지 못해도 키워드 매칭으로 관련 없는
  // 병명을 강제 표시했으나, 이는 부위와 무관한 오진의 근본 원인이었습니다.
  const finalComparisonResult = aiSelectionResult ?? comparisonResult;

  return attachNpmsOfficialSources(
    mergeAppearanceWithComparison(appearanceResult, finalComparisonResult),
    candidateReferences,
  );
}
