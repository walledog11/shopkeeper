"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Zap, ChevronRight, Loader2, Users, User, BarChart2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useUser();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName,  setLastName]  = useState(user?.lastName  ?? "");
  const [useCase,   setUseCase]   = useState<string | null>(null);
  const [teamSize,  setTeamSize]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const canContinue = firstName.trim().length > 0 && useCase !== null && teamSize !== null;

  async function handleContinue() {
    if (!canContinue || !user) return;
    setLoading(true);
    setError(null);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        unsafeMetadata: { useCase, teamSize },
      });
      router.push("/connect");
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
          <label className="block text-sm font-bold text-slate-800">Your name</label>
          <div className="flex gap-3">
            <Input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} className="bg-white" />
            <Input placeholder="Last name"  value={lastName}  onChange={e => setLastName(e.target.value)}  className="bg-white" />
          </div>
        </div>

        {/* Use case */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-800">What will you mainly use Clerk for?</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {USE_CASES.map(({ id, icon: Icon, label, description }) => {
              const selected = useCase === id;
              return (
                <button
                  key={id}
                  onClick={() => setUseCase(id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                    selected
                      ? "border-green-400 bg-green-50 ring-1 ring-green-400"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                    selected ? "bg-green-100 border-green-300" : "bg-slate-50 border-slate-200"
                  )}>
                    <Icon className={cn("w-4 h-4", selected ? "text-green-600" : "text-slate-500")} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-semibold", selected ? "text-slate-900" : "text-slate-700")}>{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Team size */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-800">How big is your support team?</label>
          <div className="grid grid-cols-4 gap-2">
            {TEAM_SIZES.map(({ id, label }) => {
              const selected = teamSize === id;
              const Icon = id === "solo" ? User : Users;
              return (
                <button
                  key={id}
                  onClick={() => setTeamSize(id)}
                  className={cn(
                    "flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-sm font-semibold transition-all",
                    selected
                      ? "border-green-400 bg-green-50 text-green-800 ring-1 ring-green-400"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <Icon className={cn("w-4 h-4 mb-1", selected ? "text-green-600" : "text-slate-400")} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-2 pt-2">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button
            onClick={handleContinue}
            disabled={!canContinue || loading}
            className={cn(
              "w-full h-11 rounded-full text-sm font-bold gap-2 transition-all",
              canContinue
                ? "bg-green-400 text-green-950 hover:bg-green-500 shadow-md"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <>Continue <ChevronRight className="w-4 h-4" /></>
            }
          </Button>
          <p className="text-xs text-slate-400">Last name is optional</p>
        </div>

      </div>
    </OnboardingShell>
  );
}
