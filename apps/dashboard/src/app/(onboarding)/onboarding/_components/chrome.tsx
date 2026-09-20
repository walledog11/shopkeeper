import { ChevronLeft, ChevronRight, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { STEPS, type StepId } from "./model";

export function Footer({ idx, stepId, canContinue, hasCustomerChannel, hasMessaging, saving, onNext, onBack, exitLabel, onExit }: {
  idx: number;
  stepId: StepId;
  canContinue: boolean;
  hasCustomerChannel: boolean;
  hasMessaging: boolean;
  saving: boolean;
  onNext: () => void;
  onBack: () => void;
  exitLabel?: string;
  onExit?: () => void | Promise<void>;
}) {
  const label = nextLabel(stepId, hasCustomerChannel, hasMessaging);

  return (
    <footer className="relative shrink-0 px-4 py-4 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent_8%,rgba(255,255,255,0.7)_50%,transparent_92%)] sm:px-7">
      <div className="flex w-full items-center gap-3">
        {exitLabel && onExit && (
          <button
            type="button"
            aria-label={exitLabel}
            onClick={() => { void onExit(); }}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/45 transition-colors hover:text-foreground/75 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">{exitLabel}</span>
          </button>
        )}
        {idx > 0 && (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={saving} className="text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground">
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
        )}
        <span className="flex-1" />
        <StepRail idx={idx} />
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

function StepRail({ idx }: { idx: number }) {
  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      <span className="sr-only" role="status">Step {idx + 1} of {STEPS.length}</span>
      {STEPS.map((step, stepIdx) => (
        <span
          key={step.id}
          aria-hidden
          className={cn(
            "h-1 rounded-full transition-all duration-300",
            stepIdx === idx
              ? "w-5 bg-foreground"
              : stepIdx < idx
                ? "w-1.5 bg-foreground/45"
                : "w-1.5 bg-foreground/[0.12]",
          )}
        />
      ))}
    </div>
  );
}

function nextLabel(stepId: StepId, hasCustomerChannel: boolean, hasMessaging: boolean): string {
  if (stepId === "email") return hasCustomerChannel ? "Continue" : "Skip for now";
  if (stepId === "connect") return hasMessaging ? "Review setup" : "Skip for now";
  return "Continue";
}
