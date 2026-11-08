import type { MetadataRoute } from "next";
import { getMarketingSiteUrl } from "@/lib/env";

// The app's own pages send `X-Robots-Tag: noindex` (next.config.js), which a
// crawler only sees if it may fetch them, so only the API and the signed-in
// dashboard are kept out here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard"] },
    sitemap: `${getMarketingSiteUrl()}/sitemap.xml`,
  };
}
