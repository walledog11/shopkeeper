import { ChevronLeft, ChevronRight, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { STEPS, type StepId } from "../_lib/onboarding-model";

export function Footer({ idx, stepId, canContinue, hasCustomerChannel, hasMessaging, saving, onNext, onBack, exitLabel, onExit, onNavigate }: {
  onNavigate: (step: StepId) => void;
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
      <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
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
          <Button variant="ghost" size="sm" onClick={onBack} disabled={saving} aria-label="Back" className="px-2 text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground sm:px-3">
            <ChevronLeft className="size-4" /><span className="hidden sm:inline">Back</span>
          </Button>
        )}
        <span className="hidden flex-1 sm:block" />
        <StepRail idx={idx} disabled={saving} onNavigate={onNavigate} />
        <span className="flex-1" />
        {(stepId !== "shopify" || canContinue) && <Button
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
        </Button>}
      </div>
    </footer>
  );
}

function StepRail({ idx, disabled, onNavigate }: { idx: number; disabled: boolean; onNavigate: (step: StepId) => void }) {
  return (
    <nav aria-label="Setup progress" className="order-first flex w-full shrink-0 flex-col items-center sm:order-none sm:w-auto">
      <span className="text-[10px] text-foreground/45 sm:sr-only" role="status">{idx + 1} of {STEPS.length}</span>
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, stepIdx) => (
          <button type="button" key={step.id} aria-label={`Step ${stepIdx + 1}: ${step.label}`}
            aria-current={stepIdx === idx ? "step" : undefined} disabled={disabled || stepIdx > idx}
            onClick={() => onNavigate(step.id)} className="flex h-6 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4">
            <span aria-hidden className={cn("h-1 rounded-full transition-all duration-300",
              stepIdx === idx ? "w-5 bg-foreground" : stepIdx < idx ? "w-1.5 bg-foreground/45" : "w-1.5 bg-foreground/[0.12]")} />
          </button>
        ))}
      </div>
    </nav>
  );
}

function nextLabel(stepId: StepId, hasCustomerChannel: boolean, hasMessaging: boolean): string {
  if (stepId === "email") return hasCustomerChannel ? "Continue" : "Set up messages later";
  if (stepId === "connect") return hasMessaging ? "Try your first draft" : "Use the dashboard";
  if (stepId === "plan") return "Open your workspace";
  return "Continue";
}
