import { redirect } from "next/navigation"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"

// General's business name moved to Account & billing, its timezone to When and
// where it reaches you.
export default function GeneralSettingsPage() {
  redirect(settingsSectionHref("billing"))
}
