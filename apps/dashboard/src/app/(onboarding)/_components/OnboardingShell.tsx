import { Zap } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { DotPattern } from "@/components/ui/dot-pattern";

interface Props {
  step: number;
  totalSteps?: number;
  title: string;
  subtitle: string;
  headerWidth?: string;
  children: React.ReactNode;
}

export default function OnboardingShell({
  step,
  totalSteps = 3,
  title,
  subtitle,
  headerWidth = "max-w-lg",
  children,
}: Props) {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-background text-foreground">
      <DotPattern
        width={26}
        height={26}
        cr={1}
        className="absolute inset-0 z-0 opacity-[0.16] [mask-image:radial-gradient(circle_at_top,white,transparent_72%)]"
      />
      <div className="absolute inset-x-0 top-0 z-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.16),transparent_60%)]" />
      <div className="absolute inset-x-0 bottom-0 z-0 h-48 bg-[linear-gradient(to_top,rgba(255,255,255,0.03),transparent)]" />

      <div className="relative z-10 flex flex-col items-center px-4 py-14 sm:py-20">
        <BrandMark className="mb-12" />

        <div className={`text-center ${headerWidth} mb-10`}>
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white/45">
            <Zap className="w-3 h-3 text-green-400" />
            Step {step} of {totalSteps}
          </div>
          <h1 className="mb-3 text-4xl font-extrabold leading-[1.1] tracking-tighter text-white sm:text-5xl">
            {title}
          </h1>
          <p className="text-base text-white/60">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  );
}
