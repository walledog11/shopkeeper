import type { Metadata } from "next";
import { LoginPageClient } from "./_components/LoginPageClient";

export const metadata: Metadata = { title: "Sign in · Shopkeeper" };

export default function LoginPage() {
  return <LoginPageClient />;
}
