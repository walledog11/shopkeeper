import { redirect } from "next/navigation"
import { settingsSectionHref } from "@/app/dashboard/_components/nav-items"

export default function SettingsPage() {
  redirect(settingsSectionHref("voice"))
}
