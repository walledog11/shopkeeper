import { SignIn } from "@clerk/nextjs";
import AuthShell from "../_components/AuthShell";
import { getAuthClerkAppearance } from "../_components/clerk-appearance";

export default function LoginPage() {
  return (
    <AuthShell
      backHref="/"
      backLabel="Back to home"
      eyebrow="Welcome back"
      title="Sign in to Shopkeeper."
      description="Pick up where you left off , your inbox, drafts, and approvals are waiting."
    >
      <SignIn
        routing="hash"
        signUpUrl="/signup"
        fallbackRedirectUrl="/dashboard"
        appearance={getAuthClerkAppearance({
          header: "hidden",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
        })}
      />
    </AuthShell>
  );
}
