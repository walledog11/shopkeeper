import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@shopkeeper/db";
import { getIncompleteOnboardingRedirect } from "@/lib/server/onboarding-guard";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    const org = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true, settings: true },
    });
    if (org) {
      const incompleteOnboardingPath = await getIncompleteOnboardingRedirect(org.id, org.settings);
      if (!incompleteOnboardingPath) {
        redirect("/dashboard");
      }
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {children}
    </div>
  );
}
