import { ChevronLeft, ChevronRight, Loader2, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/ui/cn";
import { ONBOARDING_ESSENTIALS_TOTAL, STEPS, type StepId } from "./model";

export function Header({ idx, essentialsDone, isStepComplete, onGoto, exitLabel, onExit }: {
  idx: number;
  essentialsDone: number;
  isStepComplete: (stepId: StepId) => boolean;
  onGoto: (i: number) => void;
  exitLabel?: string;
  onExit?: () => void | Promise<void>;
}) {
  return (
    <header className="relative z-20 flex items-center gap-3.5 border-b border-white/[0.06] bg-background/80 px-7 py-[18px] backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-[26px] items-center justify-center rounded-md bg-green-400 text-[14px] font-bold text-green-950 shadow-[0_2px_4px_rgba(74,222,128,0.3)]">
          <Sparkles className="size-3.5" />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-white">{PRODUCT_NAME}</div>
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-white/45">Briefing in progress</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        {STEPS.map((s, i) => {
          const active = i === idx;
          const done = isStepComplete(s.id);
          const reachable = i <= idx || done;
          return (
            <button type="button"
              key={s.id}
              onClick={() => reachable && onGoto(i)}
              disabled={!reachable}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors",
                active ? "bg-white/[0.06]" : "bg-transparent",
                reachable ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span className={cn(
                "rounded-full transition-all",
                active ? "size-2 bg-green-400" : done ? "size-1.5 bg-green-400" : "size-1.5 bg-white/15"
              )} />
              {active && (
                <span className="whitespace-nowrap font-mono text-[10.5px] font-bold uppercase tracking-wider text-white">
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap font-mono text-xs text-white/45">
        {exitLabel && onExit && (
          <button
            type="button"
            onClick={() => { void onExit(); }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="size-3" />
            <span className="text-[11.5px] font-medium normal-case tracking-normal">{exitLabel}</span>
          </button>
        )}
        <span className="inline-block size-1.5 rounded-full bg-green-400 animate-[ob-pulse-bg_2s_ease-in-out_infinite]" />
        {essentialsDone} of {ONBOARDING_ESSENTIALS_TOTAL} essentials done
      </div>
    </header>
  );
}

export function Footer({ idx, canContinue, saving, onNext, onBack }: {
  idx: number; canContinue: boolean; saving: boolean; onNext: () => void; onBack: () => void;
}) {
  const label = idx === 0 ? "Brief me" : idx === STEPS.length - 2 ? "Show me the plan" : "Continue";
  return (
    <footer className="relative z-20 border-t border-white/[0.06] bg-background px-7 pb-5 pt-4">
      <div className="mx-auto flex w-full max-w-[820px] items-center gap-2.5">
        {idx > 0 ? (
          <Button variant="ghost" size="sm" onClick={onBack} className="text-white/70 hover:bg-white/[0.06] hover:text-white">
            <ChevronLeft className="mr-1 size-4" /> Back
          </Button>
        ) : (
          <span className="font-mono text-[11.5px] text-white/45">
            Press <Kbd>↵</Kbd> to continue
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[11.5px] text-white/45">{idx + 1} of {STEPS.length}</span>
        <Button
          onClick={onNext}
          disabled={!canContinue || saving}
          className={cn(
            "h-9 gap-1.5 rounded-md px-4 text-[13px] font-semibold transition-all",
            canContinue && !saving
              ? "bg-green-400 text-green-950 shadow-[0_1px_2px_rgba(74,222,128,0.4)] hover:bg-green-300"
              : "cursor-not-allowed bg-white/[0.06] text-white/35"
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <>{label} <ChevronRight className="size-4" /></>}
        </Button>
      </div>
    </footer>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 inline-flex items-center justify-center rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-white/70">
      {children}
    </span>
  );
}
