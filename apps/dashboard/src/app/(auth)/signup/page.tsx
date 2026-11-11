import type { Metadata } from "next";
import { SignupPageClient } from "./_components/SignupPageClient";

export const metadata: Metadata = { title: "Create your account · Shopkeeper" };

export default function SignUpPage() {
  return <SignupPageClient />;
}
