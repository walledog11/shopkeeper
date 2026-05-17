"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Zap, ChevronRight, Loader2, Users, User, BarChart2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import OnboardingShell from "../_components/OnboardingShell";

const USE_CASES = [
  { id: "organize", icon: Inbox,    label: "Organize support tickets", description: "Centralize all customer messages in one place" },
  { id: "automate", icon: Zap,      label: "Automate responses",       description: "Use AI to handle common questions automatically" },
  { id: "team",     icon: Users,    label: "Manage a team inbox",      description: "Collaborate with a team on customer support" },
  { id: "analyze",  icon: BarChart2, label: "Track & analyze support", description: "Monitor response times and customer satisfaction" },
];

const TEAM_SIZES = [
  { id: "solo",  label: "Just me" },
  { id: "small", label: "2–10" },
  { id: "mid",   label: "11–50" },
  { id: "large", label: "51+" },
];

const INPUT_CLASS = "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-green-400/40 focus-visible:border-green-400/40";

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useUser();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName,  setLastName]  = useState(user?.lastName  ?? "");
  const [useCases,  setUseCases]  = useState<string[]>([]);
  const [teamSize,  setTeamSize]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const canContinue = firstName.trim().length > 0 && useCases.length > 0 && teamSize !== null;

  function toggleUseCase(id: string) {
    setUseCases(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
  }

  async function handleContinue() {
    if (!canContinue || !user) return;
    setLoading(true);
    setError(null);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        unsafeMetadata: { useCases, teamSize },
      });
      router.push("/plan");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <OnboardingShell
      step={1}
      title="Tell us about yourself."
      subtitle="This helps us set up your workspace the right way."
    >
      <div className="w-full max-w-lg space-y-8">

        {/* Name */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-white/85">Your name</label>
          <div className="flex gap-3">
            <Input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} className={INPUT_CLASS} />
            <Input placeholder="Last name"  value={lastName}  onChange={e => setLastName(e.target.value)}  className={INPUT_CLASS} />
          </div>
        </div>

        {/* Use case */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <label className="block text-sm font-bold text-white/85">What will you use Clerk for?</label>
            <span className="text-xs text-white/40">Select all that apply</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {USE_CASES.map(({ id, icon: Icon, label, description }) => {
              const selected = useCases.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleUseCase(id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                    selected
                      ? "border-green-400/50 bg-green-400/[0.08] ring-1 ring-green-400/30"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                    selected ? "bg-green-400/15 border-green-400/40" : "bg-white/[0.04] border-white/10"
                  )}>
                    <Icon className={cn("w-4 h-4", selected ? "text-green-300" : "text-white/55")} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-semibold", selected ? "text-white" : "text-white/85")}>{label}</p>
                    <p className="text-xs text-white/45 mt-0.5 leading-snug">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team size */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-white/85">How big is your support team?</label>
          <div className="grid grid-cols-4 gap-2">
            {TEAM_SIZES.map(({ id, label }) => {
              const selected = teamSize === id;
              const Icon = id === "solo" ? User : Users;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTeamSize(id)}
                  className={cn(
                    "flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-sm font-semibold transition-all",
                    selected
                      ? "border-green-400/50 bg-green-400/[0.08] text-white ring-1 ring-green-400/30"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                  )}
                >
                  <Icon className={cn("w-4 h-4 mb-1", selected ? "text-green-300" : "text-white/45")} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-2 pt-2">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button
            onClick={handleContinue}
            disabled={!canContinue || loading}
            className={cn(
              "w-full h-11 rounded-full text-sm font-bold gap-2 transition-all",
              canContinue
                ? "bg-green-400 text-green-950 hover:bg-green-300 shadow-[0_8px_24px_-8px_rgba(74,222,128,0.6)]"
                : "bg-white/[0.05] text-white/35 border border-white/10 cursor-not-allowed"
            )}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <>Continue <ChevronRight className="w-4 h-4" /></>
            }
          </Button>
          <p className="text-xs text-white/40">Last name is optional</p>
        </div>

      </div>
    </OnboardingShell>
  );
}
