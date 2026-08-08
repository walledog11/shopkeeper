"use client"

import type { KbPageData } from "@/lib/server/kb-page-data"
import { KbPageView } from "./KbPageView"
import { useKbPageState } from "./useKbPageState"

export default function KbPageClient({
  initialKbData,
}: {
  initialKbData?: KbPageData
}) {
  return <KbPageView state={useKbPageState(initialKbData)} />
}
