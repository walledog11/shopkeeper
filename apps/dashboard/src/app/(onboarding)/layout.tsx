import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@clerk/db";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    const org = await db.organization.findUnique({
      where: { clerkOrgId: orgId },
      select: {
        stripeStatus: true,
        _count: { select: { integrations: true } },
      },
    });
    const isSubscribed = org?.stripeStatus === "active" || org?.stripeStatus === "trialing";
    const hasIntegration = (org?._count.integrations ?? 0) > 0;
    if (isSubscribed && hasIntegration) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {children}
    </div>
  );
}
