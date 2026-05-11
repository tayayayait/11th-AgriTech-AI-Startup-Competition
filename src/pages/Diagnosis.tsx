import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, Loader2, RotateCcw, Trash2, Upload, XCircle } from "lucide-react";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedField } from "@/context/SelectedFieldContext";
import {
  hasNoVisibleSymptomLimitation,
  MARKETABILITY_CHECK_GUIDANCE,
  type DiagnosisResult,
} from "@/domain/ai/diagnosis";
import { buildPesticideGuideReportUrl } from "@/domain/pesticide/pesticideGuideLinks";
import { AI_DIAGNOSIS_DISCLAIMER } from "@/lib/copy";
import {
  deleteDiagnosisRecord,
  getDiagnosisRecordHistoryByField,
  saveDiagnosisRecord,
  updateDiagnosisRecordChecklist,
  type DiagnosisChecklistItem,
  type DiagnosisRecordHistoryItem,
} from "@/services/diagnosisRecordService";
import { runPhotoDiagnosis } from "@/services/diagnosisService";
import type { NpmsDiagnosisReference, NpmsPestDetailImage } from "@/services/npmsPestService";
import {
  getPsisPesticideRegistrations,
} from "@/services/psisPesticideRegistrationService";
import {
  getRepresentativePesticideOptions,
  type PesticideRepresentativeOption,
} from "@/services/psisPesticideRecommendationService";
import { toast } from "sonner";

type DiagnosisStatus =
  | "ready"
  | "uploading"
  | "analyzing"
  | "appearance_issue"
  | "no_symptom"
  | "needs_more_photo"
  | "completed"
  | "limited"
  | "failed";

interface SelectedImageFile {
  file: File;
  previewUrl: string;
}

const MAX_UPLOAD_COUNT = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIN_SHORT_SIDE = 1024;
const REVIEW_IMAGE_INLINE_BASE64_LIMIT = 1_500_000;
const REVIEW_IMAGE_MAX_SIDE = 720;
const BODY_PART_OPTIONS = [
  "잎",
  "열매",
  "줄기/뿌리",
  "전체/기타",
];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function toReadableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("abort") || message.includes("취소");
  }
  return false;
}

function getFileExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return name.slice(dotIndex + 1).toLowerCase();
}

function resolveAcceptedMimeType(file: File): string | null {
  const normalized = file.type.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp") {
    return normalized;
  }

  const fromExt = MIME_BY_EXTENSION[getFileExtension(file.name)];
  return fromExt ?? null;
}

async function readImageShortSide(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<number>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const shortSide = Math.min(image.naturalWidth, image.naturalHeight);
        resolve(shortSide);
      };
      image.onerror = () => {
        reject(new Error("손상 파일"));
      };
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("파일을 읽을 수 없습니다."));
        return;
      }

      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) {
        reject(new Error("파일을 읽을 수 없습니다."));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

async function createReviewImageDataUrl(file: File, base64: string, mimeType: string): Promise<string> {
  const originalDataUrl = `data:${mimeType};base64,${base64}`;
  if (base64.length <= REVIEW_IMAGE_INLINE_BASE64_LIMIT) {
    return originalDataUrl;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("이미지 미리보기를 생성할 수 없습니다."));
      img.src = objectUrl;
    });
    const sourceWidth = image.naturalWidth || REVIEW_IMAGE_MAX_SIDE;
    const sourceHeight = image.naturalHeight || REVIEW_IMAGE_MAX_SIDE;
    const scale = Math.min(1, REVIEW_IMAGE_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return originalDataUrl;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return originalDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function deriveDiagnosisStatus(result: DiagnosisResult): DiagnosisStatus {
  if (result.appearanceAssessment.status === "abnormal") return "appearance_issue";
  if (hasNoVisibleSymptomLimitation(result.limitations)) return "no_symptom";
  if (result.candidates.length === 0) return "limited";
  const topBand = result.candidates[0]?.confidenceBand ?? "보통";
  if (topBand === "낮음") return "limited";
  if (result.recommendedPhotos.length > 0) return "needs_more_photo";
  return "completed";
}

function statusLabel(status: DiagnosisStatus): string {
  if (status === "ready") return "대기";
  if (status === "uploading") return "업로드 중";
  if (status === "analyzing") return "분석 중";
  if (status === "appearance_issue") return "외관 이상";
  if (status === "no_symptom") return "NCPMS 후보 없음";
  if (status === "needs_more_photo") return "추가 촬영 필요";
  if (status === "completed") return "완료";
  if (status === "limited") return "판독 제한";
  return "실패";
}

function statusBadgeVariant(status: DiagnosisStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "appearance_issue") return "outline";
  if (status === "completed" || status === "no_symptom") return "secondary";
  if (status === "needs_more_photo") return "outline";
  if (status === "limited" || status === "failed") return "destructive";
  return "default";
}

function appearanceAssessmentTitle(assessment: DiagnosisResult["appearanceAssessment"]): string {
  if (assessment.status === "abnormal") return "외관상 이상 소견";
  if (assessment.status === "normal") return "외관상 뚜렷한 이상 없음";
  return "외관 판독 제한";
}

function shouldShowAppearanceAssessment(assessment: DiagnosisResult["appearanceAssessment"]): boolean {
  return assessment.status !== "uncertain" ||
    assessment.issueLabels.length > 0 ||
    assessment.visualReasons.length > 0 ||
    assessment.recommendedActions.length > 0;
}

function getNpmsDisplayImages(reference: NpmsDiagnosisReference | null): NpmsPestDetailImage[] {
  if (!reference) return [];
  const seen = new Set<string>();
  const images: NpmsPestDetailImage[] = [];

  for (const image of reference.images ?? []) {
    if (!image.url || seen.has(image.url)) continue;
    seen.add(image.url);
    images.push(image);
  }

  if (reference.thumbImg && !seen.has(reference.thumbImg)) {
    images.unshift({
      url: reference.thumbImg,
      title: `${reference.name} 대표 이미지`,
      category: reference.category,
    });
  }

  return images.slice(0, 4);
}

function NpmsImageGallery({ images }: { images: NpmsPestDetailImage[] }) {
  return (
    <div className="mt-2 grid gap-3 lg:grid-cols-2">
      {images.map((image) => (
        <figure key={image.url} className="overflow-hidden rounded-md border bg-card">
          <div className="flex h-56 items-center justify-center bg-surface-muted sm:h-64 xl:h-72">
            <img
              src={image.url}
              alt={image.title}
              className="h-full w-full object-contain p-2"
              loading="lazy"
            />
          </div>
          <figcaption className="space-y-0.5 border-t bg-background/80 px-3 py-2 text-xs">
            <div className="line-clamp-2 font-medium leading-snug">{image.title}</div>
            {image.category && <div className="text-muted-foreground">{image.category}</div>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function isNpmsActionSection(title: string): boolean {
  const normalized = title.toLowerCase();
  return normalized.includes("방제") ||
    normalized.includes("예방") ||
    normalized.includes("prvn") ||
    normalized.includes("prevent");
}

function splitNpmsActionContent(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((line) => line.replace(/^[\s·ㆍ•*-]+/, "").trim())
    .filter(Boolean);

  if (lines.length > 1) return lines.slice(0, 4);

  const oneLine = lines[0] ?? content.trim();
  if (!oneLine) return [];
  return [oneLine.length > 220 ? `${oneLine.slice(0, 220).trim()}...` : oneLine];
}

function getNpmsActionSections(reference: NpmsDiagnosisReference | null): Array<{ title: string; items: string[] }> {
  if (!reference) return [];

  return reference.sections
    .filter((section) => isNpmsActionSection(section.title))
    .map((section) => ({
      title: section.title,
      items: splitNpmsActionContent(section.content),
    }))
    .filter((section) => section.items.length > 0)
    .slice(0, 3);
}

function officialPesticideValue(value: string | null | undefined): string {
  return value?.trim() || "확실한 정보 없음";
}

function DiagnosisPesticideItem({ option }: { option: PesticideRepresentativeOption }) {
  const item = option.representativeItem;
  const brandSummary = option.brandNames.length > 1
    ? `${option.brandNames.slice(0, 3).join(", ")}${option.brandNames.length > 3 ? ` 외 ${option.brandNames.length - 3}개` : ""}`
    : "대표 상표 1개";

  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{option.farmerTitle}</div>
          <div className="text-xs text-muted-foreground">{option.groupName}</div>
        </div>
        {option.useName && <Badge variant="outline">{option.useName}</Badge>}
      </div>
      <div className="mt-2 rounded-md bg-surface-muted p-2 text-xs">
        <div className="text-muted-foreground">먼저 확인할 이유</div>
        <div className="mt-1 font-medium">{option.whySelected}</div>
      </div>
      <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">사용 기준 </span>
          {option.plainUse}
        </div>
        <div>
          <span className="text-muted-foreground">안전 기준 </span>
          {option.safetyNote}
        </div>
        <div>
          <span className="text-muted-foreground">상표 후보 </span>
          {brandSummary}
        </div>
        <div>
          <span className="text-muted-foreground">희석/사용량 </span>
          <span>{officialPesticideValue(option.officialDilution)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">공식 기준 </span>
          {officialPesticideValue(option.officialPreHarvestInterval)} / {officialPesticideValue(option.officialMaxUseCount)}
        </div>
      </div>
    </div>
  );
}

function DiagnosisPesticideRegistrationSummary({
  cropName,
  targetKeyword,
}: {
  cropName: string;
  targetKeyword: string;
}) {
  const normalizedCropName = cropName.trim();
  const normalizedTarget = targetKeyword.trim();
  const enabled = normalizedCropName.length > 0 && normalizedTarget.length > 0;
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["diagnosis-psis-pesticide-registrations", normalizedCropName, normalizedTarget],
    enabled,
    queryFn: async () => {
      const result = await getPsisPesticideRegistrations({
        cropName: normalizedCropName,
        targetKeyword: normalizedTarget,
        displayCount: 50,
      });
      return getRepresentativePesticideOptions({
        items: result.items,
        cropName: normalizedCropName,
        targetKeyword: normalizedTarget,
        maxOptions: 3,
      });
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const options = data?.options ?? [];

  return (
    <div className="mt-3 rounded-md border border-secondary/25 bg-secondary/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-secondary">공식 등록농약 후보</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            PSIS 등록정보 기준입니다. 확정 진단/자동 처방이 아닙니다.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link
            to={buildPesticideGuideReportUrl({
              cropName: normalizedCropName,
              targetKeyword: normalizedTarget,
            })}
          >
            전체 보기
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {!enabled && (
          <p className="text-sm text-muted-foreground">작물명과 후보명이 있어야 등록농약 후보를 조회할 수 있습니다.</p>
        )}
        {enabled && isLoading && (
          <p className="text-sm text-muted-foreground">등록농약 후보를 조회하는 중입니다.</p>
        )}
        {enabled && !isLoading && error && (
          <p className="text-sm text-muted-foreground">등록농약 후보를 불러오지 못했습니다. 농약 안전/등록정보 탭에서 다시 확인하세요.</p>
        )}
        {enabled && !isLoading && !error && options.length === 0 && (
          <p className="text-sm text-muted-foreground">이 후보명으로 확인된 등록농약 후보가 없습니다.</p>
        )}
        {options.map((option) => (
          <DiagnosisPesticideItem key={option.id} option={option} />
        ))}
      </div>
    </div>
  );
}

const diagnosisHistoryDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDiagnosisDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return diagnosisHistoryDateFormatter.format(date);
}

function isRenderableImageUrl(value: string | null): value is string {
  if (!value) return false;
  return value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://");
}

function getHistoryCandidateLabel(record: DiagnosisRecordHistoryItem): string {
  return record.candidates[0]?.name ?? "NCPMS 후보 없음";
}

function getHistorySummary(record: DiagnosisRecordHistoryItem): string {
  return record.result.appearanceAssessment.summary || "저장된 분석 요약이 없습니다.";
}

function DiagnosisResultCard({
  result,
  cropName,
  referenceById,
}: {
  result: DiagnosisResult;
  cropName: string;
  referenceById: Map<string, NpmsDiagnosisReference>;
}) {
  const appearanceAssessment = result.appearanceAssessment;
  const isNoSymptomResult = hasNoVisibleSymptomLimitation(result.limitations);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">사진 판독 결과</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {shouldShowAppearanceAssessment(appearanceAssessment) && (
          <div className={`rounded-md border p-3 ${
            appearanceAssessment.status === "abnormal"
              ? "border-amber-300 bg-amber-50"
              : "border-secondary/30 bg-secondary/5"
          }`}>
            <div className={`flex items-center gap-1 text-sm font-medium ${
              appearanceAssessment.status === "abnormal" ? "text-amber-800" : "text-secondary"
            }`}>
              {appearanceAssessment.status === "abnormal" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {appearanceAssessmentTitle(appearanceAssessment)}
            </div>
            <p className="mt-2 text-sm">{appearanceAssessment.summary}</p>
            {appearanceAssessment.issueLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {appearanceAssessment.issueLabels.map((label) => (
                  <Badge key={label} variant="outline">{label}</Badge>
                ))}
              </div>
            )}
            {appearanceAssessment.visualReasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {appearanceAssessment.visualReasons.map((reason, index) => (
                  <li key={`appearance-reason-${index}`}>· {reason}</li>
                ))}
              </ul>
            )}
            {appearanceAssessment.recommendedActions.length > 0 && (
              <div className="mt-3 rounded-md bg-background/70 p-2 text-sm">
                <div className="text-xs font-medium text-muted-foreground">확인 항목</div>
                <ul className="mt-1 space-y-1">
                  {appearanceAssessment.recommendedActions.map((action, index) => (
                    <li key={`appearance-action-${index}`}>· {action}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isNoSymptomResult && (
          <div className="rounded-md border border-secondary/30 bg-secondary/5 p-3">
            <div className="flex items-center gap-1 text-sm font-medium text-secondary">
              <CheckCircle2 className="h-4 w-4" />
              NCPMS 병해충 후보와 명확히 연결되지 않음
            </div>
            <p className="mt-2 text-sm">
              사진에서 NCPMS 병해충 후보와 연결할 뚜렷한 병징이나 해충 피해는 확인되지 않았습니다.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {MARKETABILITY_CHECK_GUIDANCE}
            </p>
          </div>
        )}

        {result.candidates.slice(0, 3).map((candidate, index) => {
          const reference = candidate.sourceCandidateId ? referenceById.get(candidate.sourceCandidateId) : null;
          const primaryCheck = candidate.nextChecks[0] ?? "현장에서 병징 위치와 확산 범위를 확인하세요.";
          const ncpmsImages = getNpmsDisplayImages(reference ?? null);
          const ncpmsActionSections = getNpmsActionSections(reference ?? null);

          return (
            <div key={`${candidate.name}-${index}`} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{index + 1}. {candidate.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{candidate.summary}</p>
                </div>
                <Badge variant={candidate.confidenceBand === "낮음" ? "destructive" : "outline"}>
                  {candidate.confidenceBand === "높음" ? "유사 특징 뚜렷" : candidate.confidenceBand === "보통" ? "추가 확인 필요" : "판독 제한"}
                </Badge>
              </div>

              {ncpmsImages.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-md border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>NCPMS 공식 대표 사진</span>
                    {ncpmsImages[0].category && <span>{ncpmsImages[0].category}</span>}
                  </div>
                  <div className="bg-surface-muted p-2">
                    <img
                      src={ncpmsImages[0].url}
                      alt={ncpmsImages[0].title}
                      className="mx-auto max-h-48 rounded object-contain"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-md bg-muted/40 p-2 text-sm">
                <span className="text-xs font-medium text-muted-foreground">확인 항목</span>
                <p className="mt-1">{primaryCheck}</p>
              </div>

              {ncpmsActionSections.length > 0 && (
                <div className="mt-3 rounded-md border border-secondary/20 bg-secondary/5 p-3 text-sm">
                  <div className="text-xs font-medium text-secondary">NCPMS 제공 작업</div>
                  <div className="mt-2 space-y-2">
                    {ncpmsActionSections.map((section) => (
                      <div key={`${candidate.name}-${section.title}`}>
                        <div className="font-medium">{section.title}</div>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                          {section.items.map((item, itemIndex) => (
                            <li key={`${candidate.name}-${section.title}-${itemIndex}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    공식 원문 참고용입니다. 약제 사용은 제품 라벨과 안전사용지침을 별도로 확인하세요.
                  </p>
                </div>
              )}

              <details className="mt-3 rounded-md border bg-surface-muted p-3">
                <summary className="cursor-pointer text-sm font-medium">NCPMS 근거 보기</summary>
                <div className="mt-3 space-y-3">
                  {candidate.officialSources.length > 0 && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {candidate.officialSources.map((source) => (
                        <div key={`${candidate.name}-${source.sourceId}`}>
                          {source.title} · {source.matchReason}
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-muted-foreground">판단 근거</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {candidate.visualReasons.map((reason, reasonIndex) => (
                        <li key={`${candidate.name}-visual-${reasonIndex}`}>• {reason}</li>
                      ))}
                      {candidate.weatherReasons.map((reason, reasonIndex) => (
                        <li key={`${candidate.name}-weather-${reasonIndex}`}>• {reason}</li>
                      ))}
                    </ul>
                  </div>

                  {candidate.nextChecks.length > 1 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">추가 확인</div>
                      <ul className="mt-1 space-y-1 text-sm">
                        {candidate.nextChecks.slice(1).map((check, checkIndex) => (
                          <li key={`${candidate.name}-check-${checkIndex}`}>• {check}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {reference && reference.sections.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">NCPMS 상세정보</div>
                      <div className="mt-1 space-y-2 text-sm">
                        {reference.sections.slice(0, 4).map((section) => (
                          <div key={`${reference.id}-${section.title}`}>
                            <div className="font-medium">{section.title}</div>
                            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{section.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>

              <Button asChild variant="outline" className="mt-3 w-full sm:w-auto">
                <Link
                  to={buildPesticideGuideReportUrl({
                    cropName,
                    targetKeyword: candidate.name,
                  })}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  농약 안전/등록정보 확인하기
                </Link>
              </Button>
            </div>
          );
        })}

        {result.limitations.length > 0 && !isNoSymptomResult && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-1 text-sm font-medium text-destructive">
              <XCircle className="h-4 w-4" />
              판독 제한 사유
            </div>
            <ul className="mt-1 space-y-1 text-sm">
              {result.limitations.map((item, index) => (
                <li key={`limit-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {result.recommendedPhotos.length > 0 && (
          <div className="rounded-md border bg-surface-muted p-3">
            <div className="text-sm font-medium">추가 촬영 안내</div>
            <ul className="mt-1 space-y-1 text-sm">
              {result.recommendedPhotos.map((item, index) => (
                <li key={`recommended-${index}`}>• {item}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosisHistoryChecklistCard({ checklist }: { checklist: DiagnosisChecklistItem[] }) {
  if (checklist.length === 0) return null;
  const doneCount = checklist.filter((item) => item.done).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">현장 체크리스트</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {checklist.map((item, index) => (
          <label key={`${item.label}-${index}`} className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.done} disabled />
            <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
          </label>
        ))}
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          체크리스트 {doneCount}/{checklist.length} 완료
        </div>
      </CardContent>
    </Card>
  );
}

function DiagnosisHistoryDetails({
  record,
  fallbackReferences = [],
}: {
  record: DiagnosisRecordHistoryItem;
  fallbackReferences?: NpmsDiagnosisReference[];
}) {
  const historyCropName = record.cropName ?? record.fieldSnapshot?.cropName ?? "";
  const references = record.references?.length ? record.references : fallbackReferences;
  const historyReferenceById = useMemo(
    () => new Map(references.map((reference) => [reference.id, reference])),
    [references],
  );

  return (
    <div className="border-t bg-muted/20 p-3">
      <div className="space-y-3">
        <DiagnosisResultCard
          result={record.result}
          cropName={historyCropName}
          referenceById={historyReferenceById}
        />
        <DiagnosisHistoryChecklistCard checklist={record.checklist} />
      </div>
    </div>
  );
}

export default function Diagnosis() {
  const { fields, selected, selectedId, setSelectedId } = useSelectedField();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [cropName, setCropName] = useState(selected?.crop_name ?? "");
  const [bodyPart, setBodyPart] = useState(BODY_PART_OPTIONS[0]);
  const [status, setStatus] = useState<DiagnosisStatus>("ready");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedImageFile[]>([]);
  const [lowResolutionNames, setLowResolutionNames] = useState<string[]>([]);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [checklist, setChecklist] = useState<DiagnosisChecklistItem[]>([]);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [recordImageDataUrl, setRecordImageDataUrl] = useState<string | null>(null);
  const [diagnosisReferences, setDiagnosisReferences] = useState<NpmsDiagnosisReference[]>([]);
  const [expandedHistoryRecordId, setExpandedHistoryRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!selected?.crop_name) return;
    setCropName(selected.crop_name);
  }, [selected?.crop_name]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [selectedFiles]);

  const doneChecklistCount = useMemo(
    () => checklist.filter((item) => item.done).length,
    [checklist],
  );
  const canAnalyze =
    selectedFiles.length > 0 &&
    !!selectedId &&
    cropName.trim().length > 0 &&
    status !== "analyzing" &&
    status !== "uploading";
  const canSaveChecklist = !!result && status !== "analyzing" && !!selectedId;
  const referenceById = useMemo(
    () => new Map(diagnosisReferences.map((reference) => [reference.id, reference])),
    [diagnosisReferences],
  );
  const isNoSymptomResult = result ? hasNoVisibleSymptomLimitation(result.limitations) : false;
  const appearanceAssessment = result?.appearanceAssessment;
  const selectedFieldSnapshot = useMemo(() => {
    if (!selectedId) return null;
    const currentField = fields.find((field) => field.id === selectedId) ?? selected ?? null;
    const currentFieldWithAddress = currentField as { address?: string | null } | null;
    return {
      id: selectedId,
      name: currentField?.name ?? null,
      cropName: cropName.trim() || currentField?.crop_name || null,
      address: currentFieldWithAddress?.address ?? null,
    };
  }, [cropName, fields, selected, selectedId]);

  const diagnosisHistoryQuery = useQuery({
    queryKey: ["diagnosis-record-history", selectedId],
    queryFn: () => getDiagnosisRecordHistoryByField(selectedId as string, 12),
    enabled: !!selectedId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !result) throw new Error("저장할 분석 결과가 없습니다.");
      if (savedRecordId) {
        await updateDiagnosisRecordChecklist(savedRecordId, checklist);
        return savedRecordId;
      }
      return saveDiagnosisRecord({
        fieldId: selectedId,
        cropName: cropName.trim(),
        bodyPart,
        result,
        checklist,
        firstImageName: selectedFiles[0]?.file.name ?? null,
        firstImageDataUrl: recordImageDataUrl,
        fieldSnapshot: selectedFieldSnapshot,
        references: diagnosisReferences,
      });
    },
    onSuccess: (recordId) => {
      const wasExistingRecord = savedRecordId === recordId;
      setSavedRecordId(recordId);
      void diagnosisHistoryQuery.refetch();
      toast.success(wasExistingRecord ? "현장 체크리스트를 업데이트했습니다." : "사진 판독 기록을 저장했습니다.");
    },
    onError: (error) => {
      toast.error(toReadableError(error, "진단 기록 저장에 실패했습니다."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDiagnosisRecord,
    onSuccess: (_, recordId) => {
      if (savedRecordId === recordId) {
        setSavedRecordId(null);
      }
      void diagnosisHistoryQuery.refetch();
      toast.success("사진 판독 기록을 삭제했습니다.");
    },
    onError: (error) => {
      toast.error(toReadableError(error, "사진 판독 기록 삭제에 실패했습니다."));
    },
  });

  function resetAnalysisOutput() {
    setStatus("ready");
    setUploadProgress(0);
    setErrorMessage(null);
    setResult(null);
    setChecklist([]);
    setSavedRecordId(null);
    setRecordImageDataUrl(null);
    setDiagnosisReferences([]);
  }

  function replaceSelectedFiles(nextFiles: SelectedImageFile[]) {
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setSelectedFiles(nextFiles);
  }

  async function onChangeFiles(fileList: FileList | null) {
    if (!fileList) return;

    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const limited = incoming.slice(0, MAX_UPLOAD_COUNT);
    if (incoming.length > MAX_UPLOAD_COUNT) {
      toast.error(`사진은 1회 최대 ${MAX_UPLOAD_COUNT}장까지 업로드할 수 있습니다.`);
    }

    const accepted: SelectedImageFile[] = [];
    const lowResolution: string[] = [];
    const errors: string[] = [];

    for (const file of limited) {
      const mimeType = resolveAcceptedMimeType(file);
      if (!mimeType) {
        errors.push("JPG, PNG, WEBP 파일만 업로드할 수 있습니다.");
        continue;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        errors.push("사진 1장은 최대 10MB까지 업로드할 수 있습니다.");
        continue;
      }

      try {
        const shortSide = await readImageShortSide(file);
        if (shortSide < MIN_SHORT_SIDE) {
          lowResolution.push(file.name);
        }
        accepted.push({
          file: new File([file], file.name, { type: mimeType, lastModified: file.lastModified }),
          previewUrl: URL.createObjectURL(file),
        });
      } catch {
        errors.push("파일을 읽을 수 없습니다. 다른 사진을 선택하세요.");
      }
    }

    if (accepted.length === 0) {
      if (errors.length > 0) {
        toast.error(errors[0]);
      }
      return;
    }

    replaceSelectedFiles(accepted);
    setLowResolutionNames(lowResolution);
    resetAnalysisOutput();

    if (errors.length > 0) {
      toast.error(errors[0]);
    }

  }

  async function onAnalyze() {
    if (!selectedId) {
      toast.error("필지를 먼저 선택하세요.");
      return;
    }
    if (!cropName.trim()) {
      toast.error("작물명을 입력하세요.");
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error("분석할 사진을 업로드하세요.");
      return;
    }

    setErrorMessage(null);
    setSavedRecordId(null);
    setResult(null);
    setChecklist([]);
    setDiagnosisReferences([]);
    setRecordImageDataUrl(null);

    setStatus("uploading");
    setUploadProgress(0);

    const encodedFiles: Array<{ mimeType: string; data: string }> = [];
    let firstImageDataUrl: string | null = null;
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const item = selectedFiles[index];
      try {
        const data = await fileToBase64(item.file);
        const mimeType = item.file.type || "image/jpeg";
        encodedFiles.push({ mimeType, data });
        if (index === 0) {
          firstImageDataUrl = await createReviewImageDataUrl(item.file, data, mimeType);
        }
      } catch (error) {
        setStatus("failed");
        setErrorMessage(toReadableError(error, "파일을 읽을 수 없습니다. 다른 사진을 선택하세요."));
        return;
      }
      setUploadProgress(Math.round(((index + 1) / selectedFiles.length) * 100));
    }
    setRecordImageDataUrl(firstImageDataUrl);

    const abortController = new AbortController();
    abortRef.current = abortController;
    setStatus("analyzing");

    try {
      let referencesForSave: NpmsDiagnosisReference[] = [];
      const diagnosisResult = await runPhotoDiagnosis({
        bodyPart,
        cropName: cropName.trim(),
        files: encodedFiles,
        onCandidateReferences: (references) => {
          referencesForSave = references;
          setDiagnosisReferences(references);
        },
        signal: abortController.signal,
      });

      const diagnosisChecklist = diagnosisResult.fieldChecklist.map((label) => ({
        label,
        done: false,
      }));
      setResult(diagnosisResult);
      setChecklist(diagnosisChecklist);
      setStatus(deriveDiagnosisStatus(diagnosisResult));
      try {
        const recordId = await saveDiagnosisRecord({
          fieldId: selectedId,
          cropName: cropName.trim(),
          bodyPart,
          result: diagnosisResult,
          checklist: diagnosisChecklist,
          firstImageName: selectedFiles[0]?.file.name ?? null,
          firstImageDataUrl,
          fieldSnapshot: selectedFieldSnapshot,
          references: referencesForSave,
        });
        setSavedRecordId(recordId);
        void diagnosisHistoryQuery.refetch();
      } catch (saveError) {
        toast.error(toReadableError(saveError, "사진 판독 기록 저장에 실패했습니다."));
      }
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) {
        setStatus("failed");
        setErrorMessage("AI 분석을 취소했습니다. 사진은 유지되어 있습니다.");
      } else {
        setStatus("failed");
        setErrorMessage(toReadableError(error, "AI 분석을 완료하지 못했습니다. 사진을 유지한 상태로 다시 시도할 수 있습니다."));
      }
    } finally {
      abortRef.current = null;
    }
  }

  function onCancelAnalyze() {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
  }

  function onRetry() {
    void onAnalyze();
  }

  function onReplaceFiles() {
    fileInputRef.current?.click();
  }

  function toggleChecklist(index: number, checked: boolean) {
    setChecklist((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, done: checked }
        : item
    )));
  }

  const diagnosisHistory = diagnosisHistoryQuery.data ?? [];

  return (
    <div className="space-y-4">
      {!result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">사진 판독</CardTitle>
              <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <AiDisclaimer>{AI_DIAGNOSIS_DISCLAIMER}</AiDisclaimer>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="diagnosis-field" className="text-xs">필지</Label>
                <Select
                  value={selectedId ?? ""}
                  onValueChange={(value) => {
                    if (value) setSelectedId(value);
                  }}
                >
                  <SelectTrigger id="diagnosis-field">
                    <SelectValue placeholder="필지를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name} · {field.crop_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diagnosis-crop" className="text-xs">작물명</Label>
                <Input
                  id="diagnosis-crop"
                  value={cropName}
                  onChange={(event) => setCropName(event.target.value)}
                  placeholder="예: 배추"
                  disabled={status === "analyzing"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diagnosis-body-part" className="text-xs">촬영 부위</Label>
                <Select value={bodyPart} onValueChange={setBodyPart}>
                  <SelectTrigger id="diagnosis-body-part">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BODY_PART_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-dashed p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === "analyzing"}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  사진 선택
                </Button>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG, WEBP / 1장 최대 10MB / 1회 최대 5장
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  void onChangeFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />

              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {selectedFiles.map((item) => (
                    <div key={`${item.file.name}-${item.file.lastModified}`} className="space-y-1">
                      <div className="aspect-square overflow-hidden rounded-md border bg-muted">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{item.file.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {lowResolutionNames.length > 0 && (
                <p className="text-xs text-amber-700">
                  사진이 작아 판독 정확도가 낮을 수 있습니다. 다시 촬영을 권장합니다:
                  {" "}
                  {lowResolutionNames.join(", ")}
                </p>
              )}
            </div>

            {status === "uploading" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>업로드 중</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {status === "analyzing" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  분석 중입니다. 잠시만 기다리세요.
                </div>
                <Button variant="outline" onClick={onCancelAnalyze}>
                  분석 취소
                </Button>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <p>{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void onAnalyze()} disabled={!canAnalyze}>
                사진 분석 시작
              </Button>
              {status === "failed" && (
                <>
                  <Button variant="outline" onClick={onRetry} disabled={selectedFiles.length === 0}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    다시 시도
                  </Button>
                  <Button variant="outline" onClick={onReplaceFiles}>
                    파일 교체
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

        {result && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">사진 판독 결과</CardTitle>
              <Button variant="outline" size="sm" onClick={resetAnalysisOutput}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                새로운 판독
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {appearanceAssessment && shouldShowAppearanceAssessment(appearanceAssessment) && (
                <div className={`rounded-md border p-3 ${
                  appearanceAssessment.status === "abnormal"
                    ? "border-amber-300 bg-amber-50"
                    : "border-secondary/30 bg-secondary/5"
                }`}>
                  <div className={`flex items-center gap-1 text-sm font-medium ${
                    appearanceAssessment.status === "abnormal" ? "text-amber-800" : "text-secondary"
                  }`}>
                    {appearanceAssessment.status === "abnormal" ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {appearanceAssessmentTitle(appearanceAssessment)}
                  </div>
                  <p className="mt-2 text-sm">{appearanceAssessment.summary}</p>
                  {appearanceAssessment.issueLabels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {appearanceAssessment.issueLabels.map((label) => (
                        <Badge key={label} variant="outline">{label}</Badge>
                      ))}
                    </div>
                  )}
                  {appearanceAssessment.visualReasons.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {appearanceAssessment.visualReasons.map((reason, index) => (
                        <li key={`appearance-reason-${index}`}>· {reason}</li>
                      ))}
                    </ul>
                  )}
                  {appearanceAssessment.recommendedActions.length > 0 && (
                    <div className="mt-3 rounded-md bg-background/70 p-2 text-sm">
                      <div className="text-xs font-medium text-muted-foreground">확인 항목</div>
                      <ul className="mt-1 space-y-1">
                        {appearanceAssessment.recommendedActions.map((action, index) => (
                          <li key={`appearance-action-${index}`}>· {action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {isNoSymptomResult && (
                <div className="rounded-md border border-secondary/30 bg-secondary/5 p-3">
                  <div className="flex items-center gap-1 text-sm font-medium text-secondary">
                    <CheckCircle2 className="h-4 w-4" />
                    NCPMS 병해충 후보와 명확히 연결되지 않음
                  </div>
                  <p className="mt-2 text-sm">
                    사진에서 NCPMS 병해충 후보와 연결할 뚜렷한 병징이나 해충 피해는 확인되지 않았습니다.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {MARKETABILITY_CHECK_GUIDANCE}
                  </p>
                </div>
              )}

              {result.candidates.slice(0, 3).map((candidate, index) => {
                const reference = candidate.sourceCandidateId ? referenceById.get(candidate.sourceCandidateId) : null;
                const primaryCheck = candidate.nextChecks[0] ?? "현장에서 병징 위치와 확산 범위를 확인하세요.";
                const ncpmsImages = getNpmsDisplayImages(reference ?? null);
                const ncpmsActionSections = getNpmsActionSections(reference ?? null);
                return (
                  <div key={`${candidate.name}-${index}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{index + 1}. {candidate.name}</div>
                        <p className="mt-1 text-sm text-muted-foreground">{candidate.summary}</p>
                      </div>
                      <Badge variant={candidate.confidenceBand === "낮음" ? "destructive" : "outline"}>
                        {candidate.confidenceBand === "높음" ? "유사 특징 뚜렷" : candidate.confidenceBand === "보통" ? "추가 확인 필요" : "판독 제한"}
                      </Badge>
                    </div>

                    {ncpmsImages.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-md border">
                        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                          <span>NCPMS 공식 대표 사진</span>
                          {ncpmsImages[0].category && <span>{ncpmsImages[0].category}</span>}
                        </div>
                        <div className="bg-surface-muted p-2">
                          <img
                            src={ncpmsImages[0].url}
                            alt={ncpmsImages[0].title}
                            className="mx-auto max-h-48 rounded object-contain"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 rounded-md bg-muted/40 p-2 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">확인 항목</span>
                      <p className="mt-1">{primaryCheck}</p>
                    </div>

                    {ncpmsActionSections.length > 0 && (
                      <div className="mt-3 rounded-md border border-secondary/20 bg-secondary/5 p-3 text-sm">
                        <div className="text-xs font-medium text-secondary">NCPMS 제공 작업</div>
                        <div className="mt-2 space-y-2">
                          {ncpmsActionSections.map((section) => (
                            <div key={`${candidate.name}-${section.title}`}>
                              <div className="font-medium">{section.title}</div>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                                {section.items.map((item, itemIndex) => (
                                  <li key={`${candidate.name}-${section.title}-${itemIndex}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          공식 원문 참고용입니다. 약제 사용은 제품 라벨과 안전사용지침을 별도로 확인하세요.
                        </p>
                      </div>
                    )}

                    <details className="mt-3 rounded-md border bg-surface-muted p-3">
                      <summary className="cursor-pointer text-sm font-medium">NCPMS 근거 보기</summary>
                      <div className="mt-3 space-y-3">
                        {candidate.officialSources.length > 0 && (
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {candidate.officialSources.map((source) => (
                              <div key={`${candidate.name}-${source.sourceId}`}>
                                {source.title} · {source.matchReason}
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="text-xs font-medium text-muted-foreground">판단 근거</div>
                          <ul className="mt-1 space-y-1 text-sm">
                            {candidate.visualReasons.map((reason, reasonIndex) => (
                              <li key={`${candidate.name}-visual-${reasonIndex}`}>• {reason}</li>
                            ))}
                            {candidate.weatherReasons.map((reason, reasonIndex) => (
                              <li key={`${candidate.name}-weather-${reasonIndex}`}>• {reason}</li>
                            ))}
                          </ul>
                        </div>

                        {candidate.nextChecks.length > 1 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">추가 확인</div>
                            <ul className="mt-1 space-y-1 text-sm">
                              {candidate.nextChecks.slice(1).map((check, checkIndex) => (
                                <li key={`${candidate.name}-check-${checkIndex}`}>• {check}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {reference && reference.sections.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">NCPMS 상세정보</div>
                            <div className="mt-1 space-y-2 text-sm">
                              {reference.sections.slice(0, 4).map((section) => (
                                <div key={`${reference.id}-${section.title}`}>
                                  <div className="font-medium">{section.title}</div>
                                  <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{section.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>

                    <Button asChild variant="outline" className="mt-3 w-full sm:w-auto">
                      <Link
                        to={buildPesticideGuideReportUrl({
                          cropName,
                          targetKeyword: candidate.name,
                        })}
                      >
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        농약 안전/등록정보 확인하기
                      </Link>
                    </Button>
                  </div>
                );
              })}

              {result.limitations.length > 0 && !isNoSymptomResult && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-1 text-sm font-medium text-destructive">
                    <XCircle className="h-4 w-4" />
                    판독 제한 사유
                  </div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {result.limitations.map((item, index) => (
                      <li key={`limit-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.recommendedPhotos.length > 0 && (
                <div className="rounded-md border bg-surface-muted p-3">
                  <div className="text-sm font-medium">추가 촬영 안내</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {result.recommendedPhotos.map((item, index) => (
                      <li key={`recommended-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">현장 체크리스트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklist.length === 0 && (
              <p className="text-sm text-muted-foreground">분석 완료 후 체크리스트가 생성됩니다.</p>
            )}

            {checklist.map((item, index) => (
              <label key={`${item.label}-${index}`} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(checked) => toggleChecklist(index, !!checked)}
                  disabled={!result || status === "analyzing"}
                />
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
              </label>
            ))}

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSaveChecklist || saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  저장 중
                </>
              ) : (
                <>
                  {checklist.length > 0
                    ? `${savedRecordId ? "체크리스트 업데이트" : "체크리스트 저장"} (${doneChecklistCount}/${checklist.length})`
                    : "진단 기록 저장"}
                </>
              )}
            </Button>

            {savedRecordId && (
              <div className="rounded-md border border-secondary/40 bg-secondary/5 p-3 text-sm">
                <div className="flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  저장 완료
                </div>
                <p className="mt-1 text-xs text-muted-foreground">기록 ID: {savedRecordId}</p>
                <Link to="/reports" className="mt-2 inline-flex items-center gap-1 text-xs text-secondary hover:underline">
                  상담 리포트 화면으로 이동
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">저장된 사진 판독 기록</CardTitle>
            <CardDescription>최근 30일 동안 저장된 판독 기록입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {diagnosisHistoryQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                기록을 불러오는 중입니다.
              </div>
            )}

            {!diagnosisHistoryQuery.isLoading && diagnosisHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">저장된 사진 판독 기록이 없습니다.</p>
            )}

            {diagnosisHistory.map((record) => {
              const imageAlt = record.imageName ?? "저장된 판독 이미지";
              const fieldName = record.fieldSnapshot?.name ?? selected?.name ?? "필지 정보 없음";
              const cropLabel = record.cropName ?? record.fieldSnapshot?.cropName ?? "작물 정보 없음";
              const isExpanded = expandedHistoryRecordId === record.id;
              return (
                <Collapsible
                  key={record.id}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedHistoryRecordId(open ? record.id : null)}
                >
                  <article className="overflow-hidden rounded-md border">
                    <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="grid w-full min-w-0 gap-3 rounded-md text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[140px_1fr]"
                          aria-label={`${fieldName} 판독 기록 상세 ${isExpanded ? "접기" : "보기"}`}
                        >
                          <div className="overflow-hidden rounded-md border bg-muted">
                            {isRenderableImageUrl(record.imageUrl) ? (
                              <img
                                src={record.imageUrl}
                                alt={imageAlt}
                                className="h-32 w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-32 items-center justify-center px-3 text-center text-xs text-muted-foreground">
                                저장 이미지 없음
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="font-medium">{fieldName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDiagnosisDateTime(record.createdAt)} · {cropLabel} · {record.bodyPart ?? "부위 정보 없음"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{getHistoryCandidateLabel(record)}</Badge>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary">
                                  {isExpanded ? "상세 접기" : "상세 보기"}
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </span>
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground">{getHistorySummary(record)}</p>

                            {record.result.appearanceAssessment.issueLabels.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {record.result.appearanceAssessment.issueLabels.slice(0, 4).map((label) => (
                                  <Badge key={`${record.id}-${label}`} variant="secondary">{label}</Badge>
                                ))}
                              </div>
                            )}

                            {record.checklist.length > 0 && (
                              <div className="rounded-md bg-muted/40 p-2 text-xs">
                                <span className="font-medium">체크리스트</span>
                                <span className="ml-1 text-muted-foreground">
                                  {record.checklist.filter((item) => item.done).length}/{record.checklist.length} 완료
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="판독 기록 삭제"
                        title="삭제"
                        className="h-8 w-8 justify-self-end text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending && deleteMutation.variables === record.id}
                        onClick={() => deleteMutation.mutate(record.id)}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === record.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    <CollapsibleContent>
                      <DiagnosisHistoryDetails
                        record={record}
                        fallbackReferences={record.id === savedRecordId ? diagnosisReferences : []}
                      />
                    </CollapsibleContent>
                  </article>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>

    </div>
  );
}
