import type { MetadataRoute } from "next";
import { categories } from "@/lib/commerce";
import { canonicalStoreUrl } from "@/lib/site-url";
import { getStorefront } from "@/lib/store-server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = canonicalStoreUrl();
  if (!origin || process.env.STORE_DEMO_CATALOG === "1") return [];
  const { products } = await getStorefront();
  return [
    "/", "/shop", "/wholesale", "/about", "/contact", "/delivery", "/returns", "/faq", "/terms", "/privacy",
    ...categories.map(({ id }) => `/shop?category=${id}`),
    ...products.map(({ id }) => `/products/${id}`),
  ].map((path) => ({ url: new URL(path, origin).href }));
}
