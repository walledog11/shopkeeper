"use client";

import { useCallback, useMemo } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useSingleFlightOperation } from "@/hooks/useSingleFlightOperation";
import { STORAGE_KEY } from "../_components/model";

interface MembershipLike {
  organization: { id: string; name: string };
}

function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function useOnboardingExit({
  activeOrganizationId,
  memberships,
  setActive,
}: {
  activeOrganizationId: string | undefined;
  memberships: MembershipLike[] | undefined;
  setActive: ((params: { organization: string }) => Promise<unknown>) | undefined;
}) {
  const router = useRouter();
  const { signOut } = useClerk();
  const otherMembership = memberships?.find(
    membership => membership.organization.id !== activeOrganizationId,
  );

  const { run: runWorkspaceSwitch, state: workspaceSwitchState } = useSingleFlightOperation(async (organizationId: string) => {
    if (!setActive) throw new Error("Workspace switching is not ready.");
    await setActive({ organization: organizationId });
    clearDraft();
    router.push("/dashboard");
  }, "Couldn't switch workspaces. Try again.");

  const { run: runSignOut, state: signOutState } = useSingleFlightOperation(async () => {
    await signOut({ redirectUrl: "/login" });
    clearDraft();
  }, "Couldn't sign you out. Try again.");

  const switchAction = useCallback(async () => {
    if (!otherMembership) return;
    try { await runWorkspaceSwitch(otherMembership.organization.id); } catch {}
  }, [otherMembership, runWorkspaceSwitch]);
  const signOutAction = useCallback(async () => {
    try { await runSignOut(); } catch {}
  }, [runSignOut]);

  const exit = useMemo(() => otherMembership && setActive
    ? { label: `Back to ${otherMembership.organization.name}`, action: switchAction }
    : { label: "Sign out", action: signOutAction },
  [otherMembership, setActive, signOutAction, switchAction]);

  const state = otherMembership && setActive ? workspaceSwitchState : signOutState;
  return { exit, state };
}
