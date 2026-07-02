import { ChevronLeft, ChevronRight, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import type { StepId } from "./model";

export function Footer({ idx, stepId, canContinue, hasEmail, hasMessaging, saving, onNext, onBack, exitLabel, onExit }: {
  idx: number;
  stepId: StepId;
  canContinue: boolean;
  hasEmail: boolean;
  hasMessaging: boolean;
  saving: boolean;
  onNext: () => void;
  onBack: () => void;
  exitLabel?: string;
  onExit?: () => void | Promise<void>;
}) {
  const label = nextLabel(stepId, hasEmail, hasMessaging);

  return (
    <footer className="relative shrink-0 px-4 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent_8%,rgba(255,255,255,0.7)_50%,transparent_92%)] sm:px-7">
      <div className="flex w-full items-center gap-3">
        {exitLabel && onExit && (
          <button
            type="button"
            aria-label={exitLabel}
            onClick={() => { void onExit(); }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/45 transition-colors hover:text-foreground/75"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">{exitLabel}</span>
          </button>
        )}
        {idx > 0 && (
          <Button variant="ghost" size="sm" onClick={onBack} className="text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground">
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
        )}
        <span className="flex-1" />
        <Button
          onClick={onNext}
          disabled={!canContinue || saving}
          className={cn(
            "h-11 gap-1.5 rounded-full px-5 text-[13.5px] font-semibold transition-all",
            canContinue && !saving
              ? "bg-foreground text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_22px_-10px_rgba(43,33,24,0.7)] hover:bg-foreground/85"
              : "cursor-not-allowed bg-foreground/[0.06] text-foreground/30",
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <>{label} <ChevronRight className="size-4" /></>}
        </Button>
      </div>
    </footer>
  );
}

function nextLabel(stepId: StepId, hasEmail: boolean, hasMessaging: boolean): string {
  if (stepId === "email") return hasEmail ? "Continue" : "Skip for now";
  if (stepId === "connect") return hasMessaging ? "Review setup" : "Skip for now";
  return "Continue";
}
