"use client";

import { useState } from "react";
import { useClerk, useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, LogOut, Sparkles } from "lucide-react";
import AuthShell from "../_components/AuthShell";
import { authCardClassName } from "../_components/auth-styles";
import { AuthBackLink } from "../_components/AuthBackLink";
import { AuthLoadingCard } from "../_components/AuthLoadingCard";
import { OrgAvatar } from "@/components/OrgAvatar";
import { formatRole } from "@/lib/format/role";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MembershipItem = {
  role?: string | null;
  organization: {
    id: string;
    name: string;
    imageUrl?: string | null;
  };
};

export default function SelectOrgPage() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const { signOut } = useClerk();
  const { push } = useRouter();
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgs = (userMemberships?.data ?? []) as MembershipItem[];
  const hasNoWorkspaces = isLoaded && orgs.length === 0;

  async function handleSelect(orgId: string) {
    if (!setActive || pendingOrgId) return;

    setError(null);
    setPendingOrgId(orgId);

    try {
      await setActive({ organization: orgId });
      push("/dashboard");
    } catch {
      setPendingOrgId(null);
      setError("Could not switch workspaces. Please try again.");
    }
  }

  return (
    <AuthShell
      variant="app"
      title="Switch workspace"
      description="Choose which workspace to open in the dashboard."
    >
      {!isLoaded ? (
        <AuthLoadingCard />
      ) : (
        <Card className={authCardClassName}>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base font-semibold">
              {hasNoWorkspaces ? "No workspaces yet" : "Your workspaces"}
            </CardTitle>
            <CardDescription>
              {hasNoWorkspaces
                ? "Create your first workspace to get started, or sign out."
                : `${orgs.length} available ${orgs.length === 1 ? "workspace" : "workspaces"}`}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {hasNoWorkspaces ? (
              <div className="flex flex-col items-stretch gap-2 px-6 py-5">
                <Button
                  onClick={() => push("/onboarding")}
                  size="lg"
                  className="gap-2 bg-green-400 text-green-950 hover:bg-green-300"
                >
                  <Sparkles className="size-4" />
                  Create your first workspace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => signOut({ redirectUrl: "/login" })}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {orgs.map((membership) => {
                  const org = membership.organization;
                  const isPending = pendingOrgId === org.id;

                  return (
                    <li key={org.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(org.id)}
                        disabled={pendingOrgId !== null}
                        className="group flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-accent disabled:cursor-wait"
                      >
                        <OrgAvatar
                          name={org.name}
                          imageUrl={org.imageUrl}
                          className="size-9 shrink-0 rounded-md border border-border bg-muted text-xs font-semibold text-white/70"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{org.name}</p>
                          <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                            {formatRole(membership.role)}
                          </p>
                        </div>

                        <div className="flex items-center text-muted-foreground transition-colors group-hover:text-foreground">
                          {isPending ? (
                            <Loader2 className="size-4 animate-spin text-green-400" />
                          ) : (
                            <ArrowRight className="size-4" />
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {error ? (
              <div className="border-t border-border px-6 py-4 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            {!hasNoWorkspaces ? (
              <div className="border-t border-border px-6 py-4">
                <AuthBackLink href="/dashboard" label="Back to dashboard" />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </AuthShell>
  );
}
