"use client";

import { useState, type FormEvent } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { Loader2, Plus } from "lucide-react";
import AuthShell from "../_components/AuthShell";
import { authCardClassName } from "../_components/auth-styles";
import { AuthBackLink } from "../_components/AuthBackLink";
import { AuthLoadingCard } from "../_components/AuthLoadingCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_NAME_LENGTH = 100;

export default function CreateWorkspacePage() {
  const { isLoaded, createOrganization, setActive } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!createOrganization || !setActive || pending) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a workspace name.");
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }

    setError(null);
    setPending(true);

    try {
      const created = await createOrganization({ name: trimmed });
      await setActive({ organization: created.id });
      window.location.assign("/dashboard");
    } catch {
      setPending(false);
      setError("Could not create workspace. Please try again.");
    }
  }

  return (
    <AuthShell
      variant="app"
      title="Create workspace"
      description="Add another store or brand to your account."
    >
      {!isLoaded ? (
        <AuthLoadingCard />
      ) : (
        <Card className={authCardClassName}>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base font-semibold">New workspace</CardTitle>
            <CardDescription>
              Connect channels and invite teammates after it is created.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="workspace-name" className="block text-xs font-semibold text-white/60">
                  Workspace name
                </label>
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Store"
                  maxLength={MAX_NAME_LENGTH}
                  disabled={pending}
                  autoFocus
                  className="h-10 text-sm bg-white/[0.06] border-white/[0.12] text-white/80 placeholder:text-white/25"
                />
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <Button
                type="submit"
                size="lg"
                disabled={pending || !name.trim()}
                className="w-full gap-2 bg-green-400 text-green-950 hover:bg-green-300"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create workspace
              </Button>
            </form>
            <div className="mt-4">
              <AuthBackLink href="/select-org" label="Back to workspaces" />
            </div>
          </CardContent>
        </Card>
      )}
    </AuthShell>
  );
}
