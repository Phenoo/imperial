import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Checkout } from "@/components/checkout";
import { onlinePaymentMode } from "@/lib/bachs";
import { getBusinessDetails } from "@/lib/business-server";
import { payOnDeliveryEnabled } from "@/lib/store-settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const { whatsapp } = await getBusinessDetails();
  return <div className="shell subpage"><nav aria-label="Breadcrumb" className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={14}/><span>Checkout</span></nav>
    <div className="page-intro"><h1>Checkout</h1><p>Choose your delivery area to check fees and estimated timing.</p></div>
    <Checkout onlinePayment={onlinePaymentMode()} allowDeliveryPayment={payOnDeliveryEnabled()} whatsapp={whatsapp}/>
  </div>;
}
