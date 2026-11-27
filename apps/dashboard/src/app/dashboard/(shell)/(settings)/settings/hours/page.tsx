import { redirect } from "next/navigation"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"

// Business hours moved to When and where it reaches you.
export default function HoursSettingsPage() {
  redirect(settingsSectionHref("briefing"))
}
