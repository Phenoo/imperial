import type { MetadataRoute } from "next";
import { storeUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const origin = storeUrl();
  if (process.env.STORE_DEMO_CATALOG === "1") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/checkout", "/track"] },
    ...(origin && { sitemap: new URL("/sitemap.xml", origin).href }),
  };
}
