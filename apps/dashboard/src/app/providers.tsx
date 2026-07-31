"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  nonce?: string;
  publishableKey: string;
}

export function Providers({ children, nonce, publishableKey }: Props) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      nonce={nonce}
      signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
      signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL}
    >
      {children}
    </ClerkProvider>
  );
}
