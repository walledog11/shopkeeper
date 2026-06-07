import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@shopkeeper/db";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    const org = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: {
        _count: { select: { integrations: true } },
      },
    });
    const hasIntegration = (org?._count.integrations ?? 0) > 0;
    if (hasIntegration) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {children}
    </div>
  );
}
