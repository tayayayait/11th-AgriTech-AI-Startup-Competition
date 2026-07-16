import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type WheelEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { AiDisclaimer } from "@/components/AiDisclaimer";
import { useSelectedField } from "@/context/SelectedFieldContext";
import { parseConsultationAnswer, type ConsultationAnswerSection } from "@/domain/ai/consultationAnswer";
import { PESTICIDE_DISCLAIMER } from "@/lib/copy";
import {
  getPesticideLookups,
  type PesticideLookupFilters,
} from "@/services/reportService";
import {
  createConsultationThread,
  deleteConsultationThread,
  getConsultationContextSnapshot,
  getConsultationMessagesByThread,
  getConsultationThreadsByField,
  sendConsultationMessage,
  type ConsultationContextSnapshot,
  type ConsultationMessage,
  type ConsultationThread,
} from "@/services/consultationService";
import { getPesticideSafetyGuides, type NongsaroPesticideGuide } from "@/services/nongsaroPesticideService";
import {
  getNpmsPestImageCandidates,
  type NpmsPestImageCandidate,
} from "@/services/npmsPestService";
import {
  getPsisPesticideRegistrations,
  type PsisPesticideRegistrationSearchResult,
} from "@/services/psisPesticideRegistrationService";
import {
  getRepresentativePesticideOptions,
  type PesticideRepresentativeOption,
} from "@/services/psisPesticideRecommendationService";
import { AlertTriangle, Bot, Camera, CheckCircle2, ClipboardCheck, ExternalLink, FileText, ImageIcon, Info, Loader2, MessageSquare, Plus, Send, Sparkles, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

type SourceStatus = "connected" | "delayed" | "unavailable" | "rate_limited";

function sourceStatusLabel(status: SourceStatus): string {
  if (status === "connected") return "정상 수집";
  if (status === "delayed") return "응답 지연";
  if (status === "rate_limited") return "요청 한도 초과";
  return "공식 데이터 조회 불가";
}

function sourceStatusVariant(status: SourceStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "secondary";
  if (status === "delayed") return "outline";
  return "destructive";
}

function formatKoDateTime(value: string | null | undefined): string {
  if (!value) return "확실한 정보 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "확실한 정보 없음";
  return parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatKoDate(value: string | null | undefined): string {
  if (!value) return "기한 미지정";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "기한 미지정";
  return parsed.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function taskStatusLabel(status: ConsultationContextSnapshot["tasks"][number]["status"]): string {
  if (status === "in_progress") return "진행 중";
  if (status === "deferred") return "보류";
  return "대기";
}

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value == null || Number.isNaN(value)) return "확실한 정보 없음";
  return `${value.toLocaleString("ko-KR")}${suffix}`;
}

function riskLevelLabel(value: string | null | undefined): string {
  if (value === "low") return "낮음";
  if (value === "watch") return "주의";
  if (value === "high") return "높음";
  if (value === "critical") return "심각";
  return "확실한 정보 없음";
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "pesticide" ? "pesticide" : "consultation";

  function onChangeTab(nextValue: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextValue === "pesticide") {
      nextParams.set("tab", "pesticide");
    } else {
      nextParams.delete("tab");
    }
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <Tabs value={activeTab} onValueChange={onChangeTab}>
      <TabsList>
        <TabsTrigger value="consultation">AI 상담</TabsTrigger>
        <TabsTrigger value="pesticide">농약 안전/등록정보</TabsTrigger>
      </TabsList>
      <TabsContent value="consultation" className="mt-4">
        <ConsultationPanel />
      </TabsContent>
      <TabsContent value="pesticide" className="mt-4">
        <PesticidePanel />
      </TabsContent>
    </Tabs>
  );
}

function FieldSummaryCard({ context }: { context: ConsultationContextSnapshot | null | undefined }) {
  const { selected } = useSelectedField();
  const field = context?.field;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">선택 필지 상태</CardTitle>
        <CardDescription>AI 상담은 이 필지 정보와 최근 수집 데이터를 기준으로 답변합니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">필지</div>
          <div className="mt-1 font-medium">{field?.name ?? selected?.name ?? "선택된 필지 없음"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{field?.address ?? selected?.address ?? "주소 정보 없음"}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">작물/생육</div>
          <div className="mt-1 font-medium">{field?.cropName ?? selected?.crop_name ?? "확실한 정보 없음"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{field?.growthStage ?? selected?.growth_stage ?? "생육 단계 정보 없음"}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">최근 기상</div>
          <div className="mt-1 font-medium">
            {context ? `${formatNumber(context.weather.averageTempC, "℃")} · 강수 ${formatNumber(context.weather.totalRainMm, "mm")}` : "수집 중"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">수집 {context?.weather.collectionCount ?? 0}건</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">위험도/작업</div>
          <div className="mt-1 font-medium">{riskLevelLabel(field?.riskLevel ?? selected?.risk_level)} · {field?.riskScore ?? selected?.risk_score ?? 0}</div>
          <div className="mt-1 text-xs text-muted-foreground">미완료 {context?.taskSummary.pending ?? 0}건</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ConsultationAnswerStyle {
  icon: LucideIcon;
  containerClass: string;
  iconClass: string;
  markerClass: string;
}

const DEFAULT_CONSULTATION_ANSWER_STYLE: ConsultationAnswerStyle = {
  icon: Info,
  containerClass: "border-slate-200/80 bg-slate-50/60",
  iconClass: "bg-slate-100 text-slate-600",
  markerClass: "bg-slate-400",
};

function getConsultationAnswerStyle(heading: string | null): ConsultationAnswerStyle {
  if (heading === "현재 판단") {
    return {
      icon: Sparkles,
      containerClass: "border-emerald-200/80 bg-emerald-50/65",
      iconClass: "bg-emerald-100 text-emerald-700",
      markerClass: "bg-emerald-500",
    };
  }
  if (heading === "확인할 것") {
    return {
      icon: ClipboardCheck,
      containerClass: "border-sky-200/80 bg-sky-50/65",
      iconClass: "bg-sky-100 text-sky-700",
      markerClass: "bg-sky-500",
    };
  }
  if (heading === "오늘 할 일") {
    return {
      icon: CheckCircle2,
      containerClass: "border-amber-200/80 bg-amber-50/70",
      iconClass: "bg-amber-100 text-amber-700",
      markerClass: "bg-amber-500",
    };
  }
  if (heading === "주의사항") {
    return {
      icon: AlertTriangle,
      containerClass: "border-rose-200/80 bg-rose-50/65",
      iconClass: "bg-rose-100 text-rose-700",
      markerClass: "bg-rose-500",
    };
  }
  return DEFAULT_CONSULTATION_ANSWER_STYLE;
}

function ConsultationAnswerItems({
  section,
  markerClass,
}: {
  section: ConsultationAnswerSection;
  markerClass: string;
}) {
  if (section.items.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {section.items.map((item, index) => (
        <li key={`${item.label ?? "item"}-${index}`} className="flex gap-2.5 leading-6 text-foreground/90">
          <span className={`mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full ${markerClass}`} aria-hidden="true" />
          <span>
            {item.label && <span className="font-semibold text-foreground">{item.label}</span>}
            {item.label && item.text && <span className="mx-1 text-muted-foreground">·</span>}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ConsultationLinkedTasks({ tasks }: { tasks: ConsultationContextSnapshot["tasks"] }) {
  if (tasks.length === 0) return null;

  return (
    <div data-testid="consultation-linked-tasks" className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/55 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700" aria-hidden="true">
          <ClipboardCheck className="h-3.5 w-3.5" />
        </span>
        연결된 작업
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-violet-100 bg-background/80 px-3 py-2.5">
            <div className="font-semibold text-foreground">{task.title}</div>
            {task.reason && <div className="mt-1 text-xs leading-5 text-muted-foreground">{task.reason}</div>}
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-violet-800">
              <span>우선순위 {task.priority}</span>
              <span>·</span>
              <span>{taskStatusLabel(task.status)}</span>
              <span>·</span>
              <span>{formatKoDate(task.dueAt)}</span>
            </div>
            {task.incompleteChecks.length > 0 && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                확인 항목: {task.incompleteChecks.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsultationAnswer({
  content,
  tasks,
}: {
  content: string;
  tasks: ConsultationContextSnapshot["tasks"];
}) {
  const sections = parseConsultationAnswer(content);

  return (
    <div data-testid="consultation-answer" className="space-y-2.5">
      {sections.map((section, index) => {
        const style = getConsultationAnswerStyle(section.heading);
        const SectionIcon = style.icon;

        if (!section.heading) {
          return (
            <div key={`plain-${index}`} className="space-y-2 leading-6 text-foreground/90">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${paragraph}-${paragraphIndex}`}>{paragraph}</p>
              ))}
              <ConsultationAnswerItems section={section} markerClass={style.markerClass} />
            </div>
          );
        }

        return (
          <section key={`${section.heading}-${index}`} className={`rounded-xl border p-3.5 shadow-sm ${style.containerClass}`}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${style.iconClass}`} aria-hidden="true">
                <SectionIcon className="h-4 w-4" />
              </span>
              <h4 className="text-sm font-semibold tracking-tight text-foreground">{section.heading}</h4>
            </div>
            {section.paragraphs.length > 0 && (
              <div className="space-y-2 leading-6 text-foreground/90">
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={`${paragraph}-${paragraphIndex}`}>{paragraph}</p>
                ))}
              </div>
            )}
            <ConsultationAnswerItems section={section} markerClass={style.markerClass} />
            {section.heading === "오늘 할 일" && <ConsultationLinkedTasks tasks={tasks} />}
          </section>
        );
      })}
    </div>
  );
}

function ConsultationMessages({
  messages,
  isSending,
  context,
}: {
  messages: ConsultationMessage[];
  isSending: boolean;
  context: ConsultationContextSnapshot | null | undefined;
}) {
  if (messages.length === 0 && !isSending) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        필지 관련 질문부터 일상적인 대화까지 편하게 물어보세요. 필요하면 현재 필지·작물·기상 정보를 함께 반영합니다.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[390px] pr-3">
      <div className="space-y-3">
        {messages.map((message) => {
          const isUser = message.role === "user";

          return (
            <div
              key={message.id}
              className={isUser ? "ml-auto max-w-[86%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[94%] overflow-hidden rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-background via-background to-emerald-50/60 px-4 py-3 text-sm shadow-sm"}
            >
              {isUser ? (
                <>
                  <div className="mb-1 flex items-center gap-1 text-xs opacity-80">
                    <UserRound className="h-3 w-3" />
                    농업인
                    <span>·</span>
                    <span>{formatKoDateTime(message.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap leading-6">{message.content}</div>
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700" aria-hidden="true">
                        <Bot className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="font-semibold tracking-tight text-foreground">FieldGuard AI</div>
                        <div className="text-[11px] text-muted-foreground">필지 맞춤 답변</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatKoDateTime(message.createdAt)}</span>
                  </div>
                  <ConsultationAnswer content={message.content} tasks={context?.tasks ?? []} />
                </>
              )}
            </div>
          );
        })}
        {isSending && (
          <div className="max-w-[90%] rounded-md border bg-background px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              답변 생성 중
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function ChatThreadList({
  threads,
  selectedThreadId,
  onSelect,
  onNew,
  onDelete,
  isCreating,
  deletingThreadId,
}: {
  threads: ConsultationThread[];
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
  isCreating: boolean;
  deletingThreadId: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">상담 기록</CardTitle>
            <CardDescription>최근 상담부터 표시합니다.</CardDescription>
          </div>
          <Button size="sm" onClick={onNew} disabled={isCreating}>
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            새 채팅
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {threads.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            저장된 상담이 없습니다. 새 채팅으로 시작하세요.
          </div>
        ) : (
          <ScrollArea className="h-[390px] pr-2">
            <div className="space-y-2">
              {threads.map((thread) => {
                const selected = thread.id === selectedThreadId;
                return (
                  <div key={thread.id} className="group flex items-stretch gap-1">
                    <Button
                      type="button"
                      variant={selected ? "secondary" : "ghost"}
                      className="h-auto min-w-0 flex-1 justify-start px-3 py-2 text-left"
                      onClick={() => onSelect(thread.id)}
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{thread.title}</span>
                        <span className="block text-xs text-muted-foreground">{formatKoDateTime(thread.updatedAt)}</span>
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-auto w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`상담 삭제: ${thread.title}`}
                      onClick={() => onDelete(thread.id)}
                      disabled={deletingThreadId === thread.id}
                    >
                      {deletingThreadId === thread.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
        <p className="mt-3 text-xs text-muted-foreground">상담 데이터는 마지막 활동 기준 30일 후 자동 삭제됩니다.</p>
      </CardContent>
    </Card>
  );
}

function ContextEvidencePanel({ context }: { context: ConsultationContextSnapshot | null | undefined }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">AI가 참고한 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">이번 주 농사 브리핑</div>
          {context?.weeklyBriefing ? (
            <div className="mt-2 space-y-2">
              <div className="rounded-md bg-surface-muted p-2">
                <div className="font-medium">{context.weeklyBriefing.headline}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {context.weeklyBriefing.title}
                  {context.weeklyBriefing.periodStart && context.weeklyBriefing.periodEnd
                    ? ` · ${context.weeklyBriefing.periodStart}~${context.weeklyBriefing.periodEnd}`
                    : ""}
                </div>
                {context.weeklyBriefing.actionBullets.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {context.weeklyBriefing.actionBullets.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">요약 버튼으로 생성된 이번 주 농사 브리핑이 없습니다.</p>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground">최근 사진 진단</div>
          {context?.diagnoses.length ? (
            <div className="mt-2 space-y-2">
              {context.diagnoses.slice(0, 3).map((diagnosis) => (
                <div key={`${diagnosis.candidateName}-${diagnosis.createdAt}`} className="rounded-md bg-surface-muted p-2">
                  <div className="font-medium">{diagnosis.candidateName}</div>
                  <div className="text-xs text-muted-foreground">{diagnosis.bodyPart ?? "부위 정보 없음"} · {diagnosis.confidenceBand ?? "신뢰도 정보 없음"}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">최근 사진 진단 기록이 없습니다.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConsultationPanel() {
  const qc = useQueryClient();
  const { selected } = useSelectedField();
  const fieldId = selected?.id ?? "";
  const [question, setQuestion] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ["consultation-threads", fieldId],
    enabled: !!fieldId,
    queryFn: () => getConsultationThreadsByField(fieldId, 30),
  });

  useEffect(() => {
    if (!fieldId) {
      setActiveThreadId(null);
    }
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId) return;
    if (threads.length === 0) {
      setActiveThreadId(null);
      return;
    }
    setActiveThreadId((current) => {
      if (current && threads.some((thread) => thread.id === current)) return current;
      return threads[0].id;
    });
  }, [fieldId, threads]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;

  const { data: messages = [] } = useQuery({
    queryKey: ["consultation-messages", activeThreadId],
    enabled: !!activeThreadId,
    queryFn: () => getConsultationMessagesByThread(activeThreadId!, 50),
  });

  const { data: contextSnapshot = null } = useQuery({
    queryKey: ["consultation-context", fieldId],
    enabled: !!selected,
    queryFn: () => getConsultationContextSnapshot(selected!),
  });

  const newThreadMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("필지를 선택한 뒤 새 상담을 시작하세요.");
      return createConsultationThread(selected.id);
    },
    onSuccess: (thread) => {
      setQuestion("");
      setActiveThreadId(thread.id);
      qc.setQueryData<ConsultationThread[]>(["consultation-threads", fieldId], (current = []) => [
        thread,
        ...current.filter((item) => item.id !== thread.id),
      ]);
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, "새 상담을 만들지 못했습니다."));
    },
  });

  const deleteThreadMutation = useMutation({
    mutationFn: async (threadId: string) => {
      if (!fieldId) throw new Error("필지를 선택한 뒤 상담을 삭제하세요.");
      return deleteConsultationThread(fieldId, threadId);
    },
    onSuccess: (_result, deletedThreadId) => {
      let nextThreads: ConsultationThread[] = [];
      qc.setQueryData<ConsultationThread[]>(["consultation-threads", fieldId], (current = []) => {
        nextThreads = current.filter((thread) => thread.id !== deletedThreadId);
        return nextThreads;
      });
      qc.removeQueries({ queryKey: ["consultation-messages", deletedThreadId] });
      if (activeThreadId === deletedThreadId) {
        setActiveThreadId(nextThreads[0]?.id ?? null);
      }
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, "상담 기록 삭제에 실패했습니다."));
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => sendConsultationMessage({
      field: selected,
      threadId: activeThreadId ?? threads[0]?.id ?? null,
      question: question.trim(),
    }),
    onSuccess: async (result) => {
      setQuestion("");
      setActiveThreadId(result.thread.id);
      qc.setQueryData<ConsultationThread[]>(["consultation-threads", fieldId], (current = []) => {
        const next = [result.thread, ...current.filter((thread) => thread.id !== result.thread.id)];
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["consultation-messages", result.thread.id] }),
        qc.invalidateQueries({ queryKey: ["consultation-threads", fieldId] }),
        qc.invalidateQueries({ queryKey: ["consultation-context", fieldId] }),
      ]);
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, "AI 상담 답변 생성에 실패했습니다."));
    },
  });

  function submitQuestion() {
    if (!selected) {
      toast.error("필지를 선택한 뒤 상담을 시작하세요.");
      return;
    }
    if (!question.trim()) {
      toast.error("질문을 입력하세요.");
      return;
    }
    sendMutation.mutate();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuestion();
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitQuestion();
  }

  return (
    <div className="space-y-4">
      <FieldSummaryCard context={contextSnapshot} />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1.45fr)_minmax(320px,0.85fr)]">
        <ChatThreadList
          threads={threads}
          selectedThreadId={activeThreadId}
          onSelect={setActiveThreadId}
          onNew={() => newThreadMutation.mutate()}
          onDelete={(threadId) => deleteThreadMutation.mutate(threadId)}
          isCreating={newThreadMutation.isPending}
          deletingThreadId={deleteThreadMutation.variables ?? null}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">내 필지 AI 상담</CardTitle>
            <CardDescription>필지, 최근 기상, 이번 주 농사 브리핑, 사진 진단, 작업 기록을 함께 참고합니다.</CardDescription>
            <p className="text-xs text-muted-foreground">선택 상담: {activeThread?.title ?? "새 상담"}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConsultationMessages messages={messages} isSending={sendMutation.isPending} context={contextSnapshot} />
            <form onSubmit={onSubmit} className="space-y-3">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={onQuestionKeyDown}
                placeholder="현재 필지에 대해 질문하세요. 예: 지금 물을 줘야 할까요?"
                className="min-h-[96px] resize-none"
                disabled={sendMutation.isPending}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  병해충 확정 진단과 농약 처방은 제공하지 않습니다.
                </p>
                <Button type="submit" disabled={!selected || !question.trim() || sendMutation.isPending}>
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sendMutation.isPending ? "답변 생성 중" : "질문 보내기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <ContextEvidencePanel context={contextSnapshot} />
      </div>
    </div>
  );
}

interface PesticideSearchState {
  cropName: string;
  targetKeyword: string;
  itemKeyword: string;
  maxPreHarvestDays: string;
}

type PesticideDiscoveryMode = "known" | "official-photo" | "upload-photo";

const OFFICIAL_PHOTO_SCREEN_LIMIT = 8;
const OFFICIAL_PHOTO_CARD_MIN_WIDTH = 240;
const OFFICIAL_PHOTO_CARD_MAX_WIDTH = 420;
const OFFICIAL_PHOTO_CARD_STEP = 40;

function officialValue(value: string | null | undefined): string {
  return value?.trim() || "확실한 정보 없음";
}

function PesticideDiscoveryModeSelector({
  value,
  onChange,
}: {
  value: PesticideDiscoveryMode;
  onChange: (mode: PesticideDiscoveryMode) => void;
}) {
  const options: Array<{ value: PesticideDiscoveryMode; label: string; icon: typeof FileText }> = [
    { value: "known", label: "병해충명을 알아요", icon: FileText },
    { value: "official-photo", label: "공식 사진에서 고르기", icon: ImageIcon },
    { value: "upload-photo", label: "내 사진으로 찾기", icon: Camera },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(option.value)}
            data-testid={option.value === "official-photo" ? "official-photo-mode-button" : undefined}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function PesticideRepresentativeOptionCard({ option }: { option: PesticideRepresentativeOption }) {
  const item = option.representativeItem;
  const brandSummary = option.brandNames.length > 1
    ? `${option.brandNames.slice(0, 4).join(", ")}${option.brandNames.length > 4 ? ` 외 ${option.brandNames.length - 4}개` : ""}`
    : "대표 상표 1개";
  const companySummary = option.companyNames.slice(0, 3).join(", ");

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">{option.farmerTitle}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {option.groupName}
            {companySummary ? ` · ${companySummary}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {option.useName && <Badge variant="outline">{option.useName}</Badge>}
          <Badge variant="secondary">대표 후보</Badge>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-surface-muted p-2 text-sm">
        <div className="text-xs text-muted-foreground">AI가 먼저 보여주는 이유</div>
        <div className="mt-1 font-medium">{option.whySelected}</div>
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md bg-surface-muted p-2">
          <div className="text-xs text-muted-foreground">작물/적용대상</div>
          <div className="mt-1 font-medium">{option.cropName} · {option.targetName}</div>
        </div>
        <div className="rounded-md bg-surface-muted p-2">
          <div className="text-xs text-muted-foreground">초보자용 사용 기준</div>
          <div className="mt-1 font-medium">{option.plainUse}</div>
        </div>
        <div className="rounded-md bg-surface-muted p-2">
          <div className="text-xs text-muted-foreground">수확 전 안전 기준</div>
          <div className="mt-1 font-medium">{option.safetyNote}</div>
        </div>
        <div className="rounded-md bg-surface-muted p-2">
          <div className="text-xs text-muted-foreground">같은 기준으로 묶인 상표</div>
          <div className="mt-1 font-medium">{brandSummary}</div>
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
        <div>공식 사용방법: {officialValue(option.officialUseMethod)}</div>
        <div>공식 희석/사용량: <span>{officialValue(option.officialDilution)}</span></div>
        <div>공식 안전기준: {officialValue(option.officialPreHarvestInterval)} / {officialValue(option.officialMaxUseCount)}</div>
        <div>
          공식 조회키: {item.pestiCode}/{item.diseaseUseSeq}
          {option.sourceItemCount > 1 ? ` · 같은 기준 ${option.sourceItemCount}건 묶음` : ""}
        </div>
      </div>
    </div>
  );
}

function NpmsPestImageCandidateCard({
  candidate,
  order,
  onSelect,
}: {
  candidate: NpmsPestImageCandidate;
  order: number;
  onSelect: (candidate: NpmsPestImageCandidate) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="aspect-[4/3] bg-surface-muted">
        {candidate.thumbImg ? (
          <img
            src={candidate.thumbImg}
            alt={`${candidate.name} 공식 이미지`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            공식 이미지 없음
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {order}
          </span>
          <div className="min-w-0">
            <div className="break-words font-medium">{candidate.name}</div>
            <div className="mt-0.5 break-words text-xs text-muted-foreground">
              {candidate.cropName} · {candidate.category}
            </div>
          </div>
        </div>
        <dl className="grid gap-1 rounded-md bg-surface-muted p-2 text-xs">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">NCPMS ID</dt>
            <dd className="break-all font-medium">{candidate.id}</dd>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">작물코드</dt>
            <dd className="break-all font-medium">{candidate.cropCode}</dd>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">상세 API</dt>
            <dd className="break-all font-medium">{officialValue(candidate.detailServiceCode)}</dd>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">상세키</dt>
            <dd className="break-all font-medium">{officialValue(candidate.detailKey)}</dd>
          </div>
        </dl>
        <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => onSelect(candidate)}>
          이 후보로 조회
        </Button>
      </div>
    </div>
  );
}

function OfficialPhotoSelectionPanel({
  cropName,
  candidates,
  isLoading,
  error,
  status,
  onSelect,
}: {
  cropName: string;
  candidates: NpmsPestImageCandidate[];
  isLoading: boolean;
  error: unknown;
  status: SourceStatus;
  onSelect: (candidate: NpmsPestImageCandidate) => void;
}) {
  const [photoCardMinWidth, setPhotoCardMinWidth] = useState(OFFICIAL_PHOTO_CARD_MIN_WIDTH);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = OFFICIAL_PHOTO_SCREEN_LIMIT;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [cropName, candidates]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function handleWheel(event: globalThis.WheelEvent) {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setPhotoCardMinWidth((current) => Math.min(
        OFFICIAL_PHOTO_CARD_MAX_WIDTH,
        Math.max(OFFICIAL_PHOTO_CARD_MIN_WIDTH, current + direction * OFFICIAL_PHOTO_CARD_STEP),
      ));
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [candidates.length > 0]);

  const totalPages = Math.ceil(candidates.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visibleCandidates = candidates.slice(startIndex, startIndex + itemsPerPage);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">NCPMS 공식 사진에서 고르기</CardTitle>
            <CardDescription>작물별 공식 병해충 사진을 먼저 고른 뒤 등록농약 후보를 조회합니다.</CardDescription>
          </div>
          <Badge variant={sourceStatusVariant(status)}>{sourceStatusLabel(status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!cropName.trim() && (
          <p className="text-sm text-muted-foreground">작물명을 입력하면 공식 사진 후보를 조회합니다.</p>
        )}
        {cropName.trim() && isLoading && (
          <p className="text-sm text-muted-foreground">NCPMS 공식 사진 후보를 조회하는 중입니다.</p>
        )}
        {cropName.trim() && !isLoading && error && (
          <p className="text-sm text-muted-foreground">NCPMS 공식 사진 후보를 불러오지 못했습니다.</p>
        )}
        {cropName.trim() && !isLoading && !error && candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">해당 작물의 공식 사진 후보가 확인되지 않습니다.</p>
        )}
        {candidates.length > 0 && (
          <div className="space-y-4">
            <ol
              ref={listRef}
              aria-label="NCPMS official photo candidates"
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${photoCardMinWidth}px, 1fr))` }}
            >
              {visibleCandidates.map((candidate, index) => (
                <li key={candidate.id} className="min-w-0">
                  <NpmsPestImageCandidateCard
                    candidate={candidate}
                    order={startIndex + index + 1}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ol>
            
            {totalPages > 1 && (
              <div className="flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink 
                          onClick={() => setCurrentPage(i + 1)}
                          isActive={currentPage === i + 1}
                          className="cursor-pointer"
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          사진 유사도만으로 병해충을 확정하지 않습니다. 선택한 후보명은 PSIS 공식 등록정보 조회 조건으로만 사용합니다.
        </p>
      </CardContent>
    </Card>
  );
}

function PhotoUploadPesticidePanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">내 사진으로 후보 찾기</CardTitle>
        <CardDescription>사진 판독 화면에서 NCPMS 공식 후보 안에서만 의심 후보를 좁힌 뒤 이 탭으로 돌아와 등록정보를 확인합니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          AI 판독 결과는 확정 진단이 아닙니다. 사진 판독 후보 카드의 등록농약 후보/안전정보 확인 링크를 통해 작물명과 후보명을 자동 반영합니다.
        </p>
        <Button asChild>
          <Link to="/diagnosis">
            <Camera className="h-4 w-4" />
            사진 판독 열기
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function PesticidePanel() {
  const [searchParams] = useSearchParams();
  const { selected } = useSelectedField();
  const queryCrop = searchParams.get("crop")?.trim() ?? "";
  const queryTarget = searchParams.get("target")?.trim() ?? "";
  const queryItem = searchParams.get("item")?.trim() ?? "";
  const defaultCrop = queryCrop || selected?.crop_name?.trim() || "";
  const [discoveryMode, setDiscoveryMode] = useState<PesticideDiscoveryMode>("known");
  const [filters, setFilters] = useState<PesticideSearchState>({
    cropName: defaultCrop,
    targetKeyword: queryTarget,
    itemKeyword: queryItem,
    maxPreHarvestDays: "all",
  });
  const [applied, setApplied] = useState<PesticideSearchState>({
    cropName: defaultCrop,
    targetKeyword: queryTarget,
    itemKeyword: queryItem,
    maxPreHarvestDays: "all",
  });

  useEffect(() => {
    const next = {
      cropName: defaultCrop,
      targetKeyword: queryTarget,
      itemKeyword: queryItem,
      maxPreHarvestDays: "all",
    };
    setFilters(next);
    setApplied(next);
  }, [defaultCrop, queryItem, queryTarget]);

  const maxPreHarvestDays = applied.maxPreHarvestDays === "all" ? null : Number(applied.maxPreHarvestDays);
  const hasFocusedPesticideQuery = applied.cropName.trim().length > 0 && (
    applied.targetKeyword.trim().length > 0 ||
    applied.itemKeyword.trim().length > 0
  );

  const lookupFilters: PesticideLookupFilters = useMemo(() => ({
    cropName: applied.cropName,
    targetKeyword: applied.targetKeyword,
    itemKeyword: applied.itemKeyword,
    maxPreHarvestDays,
    limit: 200,
  }), [applied, maxPreHarvestDays]);

  const {
    data: lookupRows = [],
    isLoading: lookupLoading,
    error: lookupError,
  } = useQuery({
    queryKey: ["pesticide-lookups", lookupFilters],
    queryFn: () => getPesticideLookups(lookupFilters),
  });

  const {
    data: psisResult,
    isLoading: psisLoading,
    error: psisError,
  } = useQuery({
    queryKey: [
      "psis-pesticide-registrations",
      applied.cropName,
      applied.targetKeyword,
      applied.itemKeyword,
      maxPreHarvestDays,
    ],
    enabled: hasFocusedPesticideQuery,
    queryFn: async (): Promise<{ result: PsisPesticideRegistrationSearchResult; elapsedMs: number }> => {
      const started = Date.now();
      const result = await getPsisPesticideRegistrations({
        cropName: applied.cropName.trim(),
        targetKeyword: applied.targetKeyword.trim() || undefined,
        itemKeyword: applied.itemKeyword.trim() || undefined,
        maxPreHarvestDays,
        displayCount: 50,
      });
      return { result, elapsedMs: Date.now() - started };
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const psisItems = psisResult?.result.items ?? [];
  const {
    data: representativeResult,
    isLoading: representativeLoading,
  } = useQuery({
    queryKey: [
      "psis-pesticide-representatives",
      applied.cropName,
      applied.targetKeyword,
      applied.itemKeyword,
      maxPreHarvestDays,
      psisItems.map((item) => item.id).join("|"),
    ],
    enabled: hasFocusedPesticideQuery && !psisLoading && !psisError && psisItems.length > 0,
    queryFn: () => getRepresentativePesticideOptions({
      items: psisItems,
      cropName: applied.cropName.trim(),
      targetKeyword: applied.targetKeyword.trim() || undefined,
      maxOptions: 5,
    }),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const {
    data: npmsImageCandidates = [],
    isLoading: npmsImageLoading,
    error: npmsImageError,
  } = useQuery({
    queryKey: ["npms-pest-image-candidates", applied.cropName],
    enabled: discoveryMode === "official-photo" && applied.cropName.trim().length > 0,
    queryFn: () => getNpmsPestImageCandidates(applied.cropName.trim(), 40),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const officialKeyword = useMemo(
    () => [applied.targetKeyword.trim(), applied.itemKeyword.trim()].filter(Boolean).join(" ").trim(),
    [applied.targetKeyword, applied.itemKeyword],
  );

  const {
    data: officialResult,
    isLoading: officialLoading,
    error: officialError,
  } = useQuery({
    queryKey: ["nongsaro-pesticide", applied.cropName, officialKeyword],
    enabled: applied.cropName.trim().length > 0,
    queryFn: async (): Promise<{ guides: NongsaroPesticideGuide[]; elapsedMs: number }> => {
      const started = Date.now();
      const guides = await getPesticideSafetyGuides({
        cropName: applied.cropName.trim(),
        titleKeyword: officialKeyword || undefined,
      });
      return { guides, elapsedMs: Date.now() - started };
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  const officialGuides = officialResult?.guides ?? [];
  const representativeOptions = representativeResult?.options ?? [];
  const psisTargetSuggestions = psisResult?.result.targetSuggestions ?? [];
  let npmsImageSourceStatus: SourceStatus = "unavailable";
  if (npmsImageError) {
    const message = toErrorMessage(npmsImageError, "");
    npmsImageSourceStatus = message.includes("한도") || message.includes("429") ? "rate_limited" : "unavailable";
  } else if (npmsImageCandidates.length > 0 || (discoveryMode === "official-photo" && applied.cropName.trim())) {
    npmsImageSourceStatus = "connected";
  }

  let psisSourceStatus: SourceStatus = "unavailable";
  if (psisError) {
    const message = toErrorMessage(psisError, "");
    psisSourceStatus = message.includes("한도") || message.includes("429") ? "rate_limited" : "unavailable";
  } else if (psisResult) {
    psisSourceStatus = psisResult.elapsedMs > 6000 ? "delayed" : "connected";
  }

  let sourceStatus: SourceStatus = "unavailable";
  if (officialError) {
    const message = toErrorMessage(officialError, "");
    sourceStatus = message.includes("한도") || message.includes("429") ? "rate_limited" : "unavailable";
  } else if (officialResult) {
    sourceStatus = officialResult.elapsedMs > 6000 ? "delayed" : "connected";
  }

  function applySearch() {
    if (!filters.cropName.trim()) {
      toast.error("작물명을 입력하세요.");
      return;
    }
    setApplied({ ...filters });
  }

  function selectNpmsCandidate(candidate: NpmsPestImageCandidate) {
    const next = {
      ...filters,
      cropName: candidate.cropName || filters.cropName,
      targetKeyword: candidate.name,
      itemKeyword: "",
    };
    setFilters(next);
    setApplied(next);
    setDiscoveryMode("known");
  }

  function selectPsisTargetSuggestion(targetName: string) {
    const next = {
      ...applied,
      targetKeyword: targetName,
      itemKeyword: "",
    };
    setFilters(next);
    setApplied(next);
  }

  return (
    <div className="space-y-4">
      <AiDisclaimer>{PESTICIDE_DISCLAIMER}</AiDisclaimer>
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          농약안전정보시스템 등록정보는 작물·적용대상별 공식 등록 농약 후보와 사용방법, 희석배수/10a당 사용량,
          수확 전 기준, 사용횟수를 확인하는 용도입니다. FieldGuard AI는 확정 진단, 자동 처방, 임의 비율 조정을 제공하지 않습니다.
          농사로 `agchmSafeManualList`는 별도 공식 안전사용지침 문서 확인용으로 함께 표시합니다.
        </CardContent>
      </Card>

      {discoveryMode === "official-photo" && (
        <OfficialPhotoSelectionPanel
          cropName={applied.cropName}
          candidates={npmsImageCandidates}
          isLoading={npmsImageLoading}
          error={npmsImageError}
          status={npmsImageSourceStatus}
          onSelect={selectNpmsCandidate}
        />
      )}

      {discoveryMode === "upload-photo" && <PhotoUploadPesticidePanel />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">공식 자료 검색</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PesticideDiscoveryModeSelector value={discoveryMode} onChange={setDiscoveryMode} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="pesticide-crop" className="text-xs">작물명</Label>
              <Input
                id="pesticide-crop"
                value={filters.cropName}
                onChange={(event) => setFilters((prev) => ({ ...prev, cropName: event.target.value }))}
                placeholder="예: 포도"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pesticide-target" className="text-xs">병해충명/적용대상</Label>
              <Input
                id="pesticide-target"
                value={filters.targetKeyword}
                onChange={(event) => setFilters((prev) => ({ ...prev, targetKeyword: event.target.value }))}
                placeholder="예: 노균병"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pesticide-item" className="text-xs">농약명</Label>
              <Input
                id="pesticide-item"
                value={filters.itemKeyword}
                onChange={(event) => setFilters((prev) => ({ ...prev, itemKeyword: event.target.value }))}
                placeholder="예: 만코제브"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pesticide-pre-harvest" className="text-xs">안전사용기간 필터</Label>
              <Select
                value={filters.maxPreHarvestDays}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, maxPreHarvestDays: value }))}
              >
                <SelectTrigger id="pesticide-pre-harvest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="3">3일 이하</SelectItem>
                  <SelectItem value="7">7일 이하</SelectItem>
                  <SelectItem value="14">14일 이하</SelectItem>
                  <SelectItem value="21">21일 이하</SelectItem>
                  <SelectItem value="30">30일 이하</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={applySearch}>공식 자료 확인</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">농약안전정보시스템 등록농약 후보</CardTitle>
              <CardDescription>PSIS 등록정보 API 기준입니다. 상표명 검색은 품목명 검색 결과가 없을 때 보조로 수행합니다.</CardDescription>
            </div>
            <Badge variant={sourceStatusVariant(psisSourceStatus)}>
              {sourceStatusLabel(psisSourceStatus)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasFocusedPesticideQuery && (
            <p className="text-sm text-muted-foreground">
              병해충명/적용대상 또는 농약명을 입력하거나 NCPMS 공식 사진 후보를 선택하면 등록농약 후보를 조회합니다.
            </p>
          )}
          {hasFocusedPesticideQuery && psisLoading && (
            <p className="text-sm text-muted-foreground">등록농약 후보를 조회하는 중입니다.</p>
          )}
          {hasFocusedPesticideQuery && !psisLoading && psisError && (
            <p className="text-sm text-muted-foreground">등록농약 후보를 불러오지 못했습니다. PSIS 키와 서비스 권한을 확인하세요.</p>
          )}
          {hasFocusedPesticideQuery && !psisLoading && !psisError && psisItems.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">해당 조건의 등록농약 후보가 확인되지 않습니다.</p>
              {psisTargetSuggestions.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">PSIS 등록 적용대상 후보</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    선택한 적용대상과 정확히 일치하는 등록정보는 0건입니다. 아래는 같은 작물에서 부분 명칭으로 확인된 공식 등록 적용대상입니다.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {psisTargetSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion.targetName}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => selectPsisTargetSuggestion(suggestion.targetName)}
                      >
                        {suggestion.targetName}
                        <span className="text-xs text-muted-foreground">
                          {suggestion.itemCount.toLocaleString("ko-KR")}건
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {hasFocusedPesticideQuery && !psisLoading && !psisError && psisItems.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground">
                총 {psisResult?.result.totalCount.toLocaleString("ko-KR") ?? psisItems.length.toLocaleString("ko-KR")}건 중 {psisItems.length.toLocaleString("ko-KR")}건 조회
                {representativeResult ? ` · ${representativeResult.groupCount.toLocaleString("ko-KR")}개 기준으로 묶어 대표 ${representativeOptions.length.toLocaleString("ko-KR")}개 표시` : ""}
                {maxPreHarvestDays == null ? "" : ` · 수확 전 ${maxPreHarvestDays}일 이하 필터 적용`}
              </div>
              {representativeLoading && (
                <p className="text-sm text-muted-foreground">Gemini가 공식 등록정보 안에서 대표 후보를 정리하는 중입니다.</p>
              )}
              {representativeResult?.selectionSource === "official_fallback" && (
                <p className="text-sm text-muted-foreground">Gemini 요약을 완료하지 못해 공식 등록정보 기준으로 중복을 묶어 표시합니다.</p>
              )}
              <div className="space-y-3">
                {(representativeOptions.length > 0 ? representativeOptions : []).map((option) => (
                  <PesticideRepresentativeOptionCard key={option.id} option={option} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">농사로 공식 지침</CardTitle>
            <Badge variant={sourceStatusVariant(sourceStatus)}>
              {sourceStatusLabel(sourceStatus)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {officialLoading && (
            <p className="text-sm text-muted-foreground">공식 지침을 조회하는 중입니다.</p>
          )}
          {!officialLoading && officialError && (
            <p className="text-sm text-muted-foreground">공식 지침을 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
          )}
          {!officialLoading && !officialError && officialGuides.length === 0 && (
            <p className="text-sm text-muted-foreground">해당 조건의 공식 지침이 확인되지 않습니다.</p>
          )}
          {!officialLoading && !officialError && officialGuides.map((guide) => (
            <div key={guide.sourceId} className="rounded-md border p-3">
              <div className="font-medium">{guide.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {guide.cropName ?? "작목 정보 없음"}
                {guide.reformYm ? ` · 개정 ${guide.reformYm}` : ""}
                {guide.nationName ? ` · ${guide.nationName}` : ""}
              </div>
              {guide.fileUrl && (
                <a
                  href={guide.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                >
                  원문 열기 <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">안전사용기간/사용횟수 참고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lookupLoading && (
            <p className="text-sm text-muted-foreground">안전사용기간 데이터를 조회하는 중입니다.</p>
          )}
          {!lookupLoading && lookupError && (
            <p className="text-sm text-muted-foreground">안전사용기간 데이터를 불러오지 못했습니다.</p>
          )}
          {!lookupLoading && !lookupError && lookupRows.length === 0 && (
            <p className="text-sm text-muted-foreground">해당 조건의 공식 자료가 확인되지 않습니다.</p>
          )}

          {!lookupLoading && !lookupError && lookupRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">작물</th>
                    <th className="px-3 py-2 text-left">적용 대상</th>
                    <th className="px-3 py-2 text-left">품목/성분</th>
                    <th className="px-3 py-2 text-right">수확 전 사용기간</th>
                    <th className="px-3 py-2 text-right">사용 횟수</th>
                    <th className="px-3 py-2 text-left">원문</th>
                  </tr>
                </thead>
                <tbody>
                  {lookupRows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2">{row.crop}</td>
                      <td className="px-3 py-2">{row.target}</td>
                      <td className="px-3 py-2">{row.item}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="secondary">{row.pre_harvest_days == null ? "확실한 정보 없음" : `${row.pre_harvest_days}일`}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="secondary">{row.max_uses == null ? "확실한 정보 없음" : `${row.max_uses}회`}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {row.source_url && (
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-secondary hover:underline"
                          >
                            열기 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          농약 등록정보와 지침은 공식 자료 확인을 우선하며, 자동 처방을 제공하지 않습니다.
        </span>
      </div>
    </div>
  );
}
