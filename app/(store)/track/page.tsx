import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TrackOrder } from "@/components/track-order";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Look up an Imperial order with your order reference and phone number. See recorded order updates or review products to buy again.",
  robots: { index: false },
};

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  const reference = typeof ref === "string" && /^IP-[A-F0-9]{24}$/.test(ref) ? ref : "";
  return <div className="shell subpage tracking-page"><nav aria-label="Breadcrumb" className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={14}/><span>Track order</span></nav>
    <div className="page-intro"><h1>Track your order</h1><p>Enter your order reference and the phone number used at checkout.</p></div>
    <TrackOrder key={reference} initialReference={reference}/>
  </div>;
}
