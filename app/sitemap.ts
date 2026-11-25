import type { MetadataRoute } from "next";
import { canonicalStoreUrl } from "@/lib/site-url";
import { getStorefront } from "@/lib/store-server";
import { searchIndexingEnabled } from "@/lib/search-indexing";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = canonicalStoreUrl();
  if (!origin || !searchIndexingEnabled()) return [];
  const { products } = await getStorefront();
  return [
    "/", "/shop", "/wholesale", "/about", "/contact", "/delivery", "/returns", "/faq", "/terms", "/privacy",
    ...products.map(({ id }) => `/products/${id}`),
  ].map((path) => ({ url: new URL(path, origin).href }));
}
