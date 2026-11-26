"use client";

import { useCallback } from "react";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import {
  operationError,
  useSingleFlightOperation,
  type OperationState,
} from "@/hooks/useSingleFlightOperation";
import type { OnboardingViewer } from "../_lib/onboarding-model";

const ORGANIZATION_ERROR = "Couldn't prepare your workspace. Try again.";

/**
 * The workspace being set up. The server's answer is used until the sign-in
 * script loads, so setup renders at once; the script is needed only to create a
 * workspace for someone who has none.
 */
export function useOnboardingOrganization(initialOrganization: OnboardingViewer["organization"]) {
  const { isLoaded: organizationLoaded, organization: clerkOrganization } = useOrganization();
  const organizationList = useOrganizationList({ userMemberships: { infinite: false } });
  const {
    createOrganization,
    isLoaded: organizationListLoaded,
    setActive,
  } = organizationList;
  const clerkLoaded = organizationLoaded && organizationListLoaded;
  const organization = clerkOrganization ?? initialOrganization;

  const { run: runOrganization, state: organizationOperation } = useSingleFlightOperation(async (storeName: string) => {
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

  const organizationReady = Boolean(organization)
    || (organizationOperation.status === "succeeded" && organizationOperation.result);

  return {
    clerkLoaded,
    ensureOrganization,
    organization,
    organizationOperation,
    organizationReady,
    organizationError: operationError(organizationOperation),
  };
}

export type OnboardingOrganizationOperation = OperationState;
