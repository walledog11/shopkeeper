import type { MetadataRoute } from "next";
import { getDashboardAppUrl } from "@/lib/env";

const publicRoutes = [
  "",
  "/product/customer-support",
  "/product/order-operations",
  "/product/approvals-and-controls",
  "/product/integrations",
  "/product/security",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getDashboardAppUrl();

  return publicRoutes.map((path, index) => ({
    url: new URL(path || "/", baseUrl).toString(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path.startsWith("/product/") ? 0.8 : 0.4,
  }));
}
