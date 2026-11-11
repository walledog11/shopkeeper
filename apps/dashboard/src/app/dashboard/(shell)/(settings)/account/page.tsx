import { settingsSectionMetadata } from "@/app/dashboard/_components/nav-items"
import AccountSettingsSection from "../settings/_components/AccountSettingsSection"

export const metadata = settingsSectionMetadata("account")

export default function AccountPage() {
  return <AccountSettingsSection />
}
