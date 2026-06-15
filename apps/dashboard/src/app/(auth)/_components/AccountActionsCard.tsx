"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { ArrowRight, Building2, Loader2, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountIdentity } from "./AccountIdentity";
import { AuthBackLink } from "./AuthBackLink";
import { authCardClassName } from "./auth-styles";

interface AccountActionsCardProps {
  backHref?: string;
  backLabel?: string;
}

export function AccountActionsCard({
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}: AccountActionsCardProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const fullName = user?.fullName ?? user?.firstName ?? "there";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  async function handleSwitchAccount() {
    setIsSigningOut(true);
    await signOut({ redirectUrl: "/login" });
  }

  return (
    <Card className={authCardClassName}>


      <CardContent className="space-y-4 pt-4">
        <AccountIdentity fullName={fullName} email={email} imageUrl={user?.imageUrl} />

        <div className="flex flex-col gap-2">
          <Button
            asChild
            size="lg"
            className="w-full gap-2 rounded-full bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c]"
          >
            <Link href="/dashboard">
              Continue to dashboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full gap-2">
            <Link href="/select-org">
              <Building2 className="size-4" />
              Switch workspace
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleSwitchAccount}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserRound className="size-4" />
            )}
            Sign in as a different account
          </Button>

          <AuthBackLink href={backHref} label={backLabel} />
        </div>
      </CardContent>
    </Card>
  );
}
