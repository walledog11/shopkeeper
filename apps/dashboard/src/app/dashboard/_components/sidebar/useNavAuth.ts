"use client";

import { useSyncExternalStore } from "react";
import { useClerk, useOrganization, useOrganizationList, useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { fetcher } from "@/lib/api/fetcher";
import { resolveAgentSettings, type AutonomyTier } from "@shopkeeper/agent/settings";
import { formatRole } from "@/lib/format/role";
import type { OrgSettings } from "@/types";

export function useNavAuth(initialAutonomyTier: AutonomyTier) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { organization, membership, memberships } = useOrganization({
    memberships: { infinite: false, pageSize: 20 },
  });
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  const { data: orgData } = useSWR<{ planName?: string; settings?: Partial<OrgSettings> }>("/api/org", fetcher, {
    revalidateOnFocus: false,
  });
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const membershipPage = memberships as { count?: number; data?: unknown[] } | undefined;
  const seatCount = membershipPage?.count ?? membershipPage?.data?.length ?? 1;
  const autonomyTier = orgData?.settings
    ? resolveAgentSettings(orgData.settings).autonomyTier ?? initialAutonomyTier
    : initialAutonomyTier;

  return {
    user,
    signOut,
    organization,
    userMemberships,
    setActive,
    mounted,
    fullName: user?.fullName ?? user?.firstName ?? "User",
    roleLabel: formatRole(membership?.role),
    planName: orgData?.planName ?? "Free",
    seatCount,
    autonomyTier,
  };
}

export type NavAuth = ReturnType<typeof useNavAuth>;
