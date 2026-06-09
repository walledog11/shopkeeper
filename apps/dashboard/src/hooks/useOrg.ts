"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import type { OrgSettings } from "@/types"

// Shape of the /api/org GET response (see app/api/org/route.ts).
export interface OrgResponse {
  id: string
  name: string
  settings: Partial<OrgSettings>
  version: string
  planName: string
  stripeStatus: string | null
  inboundEmailDomain: string
}

export function useOrg({ enabled = true, revalidateOnFocus = true }: { enabled?: boolean; revalidateOnFocus?: boolean } = {}) {
  return useSWR<OrgResponse>(enabled ? "/api/org" : null, fetcher, { revalidateOnFocus })
}
