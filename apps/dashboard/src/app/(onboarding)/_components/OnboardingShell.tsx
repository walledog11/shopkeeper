import Link from "next/link";
import { Bot, Zap } from "lucide-react";
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
    <div className="relative min-h-screen overflow-hidden bg-black">
      <DotPattern
        width={26}
        height={26}
        cr={1}
        className="absolute inset-0 z-0 opacity-70 [mask-image:linear-gradient(to_bottom,white_40%,transparent_100%)]"
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] opacity-[0.12] pointer-events-none blur-[120px] bg-gradient-to-b from-green-400 to-transparent z-0" />

      <div className="relative z-10 flex flex-col items-center px-4 py-14 sm:py-20">

        <Link href="/" className="flex items-center gap-2 group mb-12">
          <Bot className="w-5 h-5 text-slate-800 group-hover:text-green-500 transition-colors" />
          <span className="text-xl font-extrabold text-slate-900 tracking-tight">clerk</span>
        </Link>

        <div className={`text-center ${headerWidth} mb-10`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-widest mb-4 shadow-sm">
            <Zap className="w-3 h-3 text-green-500" />
            Step {step} of {totalSteps}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter text-slate-900 leading-[1.1] mb-3">
            {title}
          </h1>
          <p className="text-slate-500 text-base">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  );
}
