import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ShopCatalog } from "@/components/catalog-view";
import { categories } from "@/lib/commerce";
import { readShopFilters } from "@/lib/catalog-search";
import { getStorefront } from "@/lib/store-server";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Shop imported groceries",
  description: "Find imported rice, tinned foods, noodles, drinks and more by brand, category, pack size or availability.",
  ...canonicalMetadata("/shop"),
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, { products }] = await Promise.all([searchParams, getStorefront()]);
  const filters = readShopFilters((key) => params[key]);
  const category = categories.find((entry) => entry.id === filters.category);
  return <div className="shell subpage">
    <nav aria-label="Breadcrumb" className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={14}/><span>Shop</span>{category && <><ChevronRight size={14}/><span>{category.name}</span></>}</nav>
    <h1 className="sr-only">{category?.name ?? "Shop"}</h1>
    <ShopCatalog products={products} filters={filters}/>
  </div>;
}
