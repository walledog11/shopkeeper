import type { Metadata } from "next";

// Every app page names itself in the browser tab; the marketing tagline is the
// public site's title, not the app's.
export const metadata: Metadata = {
  title: { default: "Shopkeeper", template: "%s · Shopkeeper" },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
