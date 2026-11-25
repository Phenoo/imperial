import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { WholesaleForm } from "@/components/wholesale-form";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Carton Sales & Wholesale",
  description: "Request a wholesale quote for cartons, cases and bulk pantry staples from Imperial Foods & Beverages.",
  ...canonicalMetadata("/wholesale"),
};

export default async function WholesalePage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
  const { product } = await searchParams;
  const initialProduct = typeof product === "string" ? product : "";

  return <div className="shell subpage">
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link><ChevronRight size={14}/><span>Wholesale</span>
    </nav>
    <div className="page-intro">
      <h1>Carton sales &amp; wholesale</h1>
      <p>Imperial Foods &amp; Beverages sells by the carton and supplies wholesale orders. Request a quote to confirm pack sizes, pricing, availability and delivery.</p>
    </div>
    <WholesaleForm key={initialProduct} initialProduct={initialProduct}/>
  </div>;
}
