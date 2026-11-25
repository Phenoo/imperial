import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { getBusinessDetails } from "@/lib/business-server";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "About Imperial",
  description: "About Imperial Foods & Beverages and how to shop for imported groceries and wholesale cartons.",
  ...canonicalMetadata("/about"),
};

export default async function AboutPage() {
  const business = await getBusinessDetails();
  return <StoreInformation current="/about" description="Imported groceries for household shopping and wholesale enquiries.">
    <section>
      <h2>{business.tradingName}</h2>
      <p>Browse rice, tinned foods, noodles, drinks, snacks and other pantry staples. Check each product’s selling unit and availability before adding it to your basket.</p>
      <p>For cartons and bulk quantities, request a quote so the team can confirm pack contents, price and delivery.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className="button button-green" href="/shop">Shop groceries</Link>
        <Link className="button button-outline" href="/wholesale">Buy wholesale</Link>
      </div>
    </section>
    {business.photoUrl && <Image className="mt-5 w-full rounded-lg object-contain" src={business.photoUrl} alt={business.photoAlt} width={900} height={600} unoptimized/>}
    {(business.registration || business.address) && <section>
      <h2>Business details</h2>
      {business.registration && <p>{business.registration}</p>}
      {business.address && <p className="whitespace-pre-line">{business.address}</p>}
    </section>}
    <section>
      <h2>Shopping and delivery</h2>
      <p>View <Link href="/delivery">delivery fees and estimates for eligible Lagos areas</Link>, or contact us for a delivery quotation outside those areas.</p>
      <p>For help finding a product or arranging a bulk order, <Link href="/contact">contact Imperial</Link>.</p>
    </section>
  </StoreInformation>;
}
