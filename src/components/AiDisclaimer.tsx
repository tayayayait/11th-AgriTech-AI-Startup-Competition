import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function AiDisclaimer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
