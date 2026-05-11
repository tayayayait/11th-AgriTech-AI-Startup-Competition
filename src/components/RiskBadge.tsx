import { AlertTriangle, CheckCircle2, CircleHelp, Flame, ShieldAlert } from "lucide-react";
import { RISK_LABEL, RiskLevel } from "@/lib/copy";
import { cn } from "@/lib/utils";

const STYLE: Record<RiskLevel, { bg: string; text: string; Icon: typeof AlertTriangle }> = {
  low: { bg: "bg-risk-low/10", text: "text-risk-low", Icon: CheckCircle2 },
  watch: { bg: "bg-risk-watch/10", text: "text-risk-watch", Icon: AlertTriangle },
  high: { bg: "bg-risk-high/10", text: "text-risk-high", Icon: ShieldAlert },
  critical: { bg: "bg-risk-critical/10", text: "text-risk-critical", Icon: Flame },
  unknown: { bg: "bg-risk-unknown/10", text: "text-risk-unknown", Icon: CircleHelp },
};

interface Props {
  level: RiskLevel;
  size?: "sm" | "md";
  className?: string;
}

export function RiskBadge({ level, size = "md", className }: Props) {
  const { bg, text, Icon } = STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium",
        bg,
        text,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
      <span>{RISK_LABEL[level]}</span>
    </span>
  );
}
