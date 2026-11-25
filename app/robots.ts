import type { MetadataRoute } from "next";
import { canonicalStoreUrl } from "@/lib/site-url";
import { searchIndexingEnabled } from "@/lib/search-indexing";

export default function robots(): MetadataRoute.Robots {
  const origin = canonicalStoreUrl();
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/checkout", "/track", "/catalogue-update", "/saved"] },
    ...(origin && { sitemap: new URL("/sitemap.xml", origin).href }),
  };
}
