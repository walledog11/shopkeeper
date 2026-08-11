"use client";

import { useCallback } from "react";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { useSingleFlightOperation } from "@/hooks/useSingleFlightOperation";

const ORGANIZATION_ERROR = "Couldn't prepare your workspace. Try again.";

export function useOnboardingOrganization() {
  const { isLoaded: organizationLoaded, organization } = useOrganization();
  const organizationList = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const {
    createOrganization,
    isLoaded: organizationListLoaded,
    setActive,
    userMemberships,
  } = organizationList;
  const clerkLoaded = organizationLoaded && organizationListLoaded;

  const { run: runOrganization, state: operation } = useSingleFlightOperation(async (storeName: string) => {
    if (organization) return true;
    if (!clerkLoaded || !createOrganization || !setActive) return false;
    const name = storeName.trim();
    if (!name) return false;

    const created = await createOrganization({ name });
    await setActive({ organization: created.id });
    return true;
  }, ORGANIZATION_ERROR);

  const ensureOrganization = useCallback(async (storeName: string): Promise<boolean> => {
    if (organization) return true;
    if (!clerkLoaded) return false;
    try {
      return await runOrganization(storeName);
    } catch {
      return false;
    }
  }, [clerkLoaded, organization, runOrganization]);

  return {
    clerkLoaded,
    createOrganization,
    ensureOrganization,
    operation,
    organization,
    setActive,
    userMemberships,
  };
}
