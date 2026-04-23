"use client";

import { CreateOrganization } from "@clerk/nextjs";
import { Building2, CheckCircle2, Sparkles } from "lucide-react";
import AuthShell from "../_components/AuthShell";
import { getAuthClerkAppearance } from "../_components/clerk-appearance";

const checklist = [
  {
    icon: Building2,
    title: "Name your workspace",
    description: "Give your team a home for inboxes, settings, and automation.",
  },
  {
    icon: Sparkles,
    title: "Continue to onboarding",
    description: "Once it is created, you will head straight into channel setup.",
  },
  {
    icon: CheckCircle2,
    title: "Invite teammates later",
    description: "You do not need the full team list before getting started.",
  },
];

export default function CreateOrgPage() {
  return (
    <AuthShell
      backHref="/select-org"
      backLabel="Back to workspaces"
      eyebrow="Workspace setup"
      title="Create a workspace that feels ready on day one."
      description="Set up a dedicated space for your team, then move directly into the onboarding flow to connect channels and configure the dashboard."
      aside={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {checklist.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_80px_-56px_rgba(0,0,0,0.95)]"
            >
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Icon className="size-4 text-green-400" />
              </div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">{description}</p>
            </div>
          ))}
        </div>
      }
      contentClassName="max-w-[30rem]"
    >
      <CreateOrganization
        afterCreateOrganizationUrl="/connect"
        appearance={getAuthClerkAppearance({
          header: "hidden",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
        })}
      />
    </AuthShell>
  );
}
