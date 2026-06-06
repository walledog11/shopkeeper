"use client"

import { KbPageView } from "./KbPageView"
import { useKbPageState } from "./useKbPageState"

export default function KbPageClient() {
  return <KbPageView state={useKbPageState()} />
}
