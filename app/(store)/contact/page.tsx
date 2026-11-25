import type { Metadata } from "next";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { SupportLinks } from "@/components/support-links";
import { getBusinessDetails } from "@/lib/business-server";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Contact Imperial",
  description: "Get in touch about groceries, delivery, wholesale quotations and order support.",
  ...canonicalMetadata("/contact"),
};

export default async function ContactPage() {
  const business = await getBusinessDetails();
  return <StoreInformation current="/contact" description="Ask about a product, an order or a delivery quotation.">
    <section>
      <h2>{business.tradingName} customer service</h2>
      {business.whatsapp || business.supportEmail || business.phone ? <SupportLinks business={business}/> : <p>For an existing order, use the contact channel on your order correspondence. If you have an order reference, you can check its status below.</p>}
      {business.serviceHours && <p><strong>Customer service hours</strong> {business.serviceHours}</p>}
      {business.address && <p className="whitespace-pre-line"><strong>Public business address</strong><br/>{business.address}</p>}
      {business.address && business.mapUrl && <p><a href={business.mapUrl} target="_blank" rel="noopener noreferrer">View the public location on a map</a></p>}
      {(business.instagram || business.facebook) && <p>
        {business.instagram && <a className="mr-4" href={business.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
        {business.facebook && <a href={business.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
      </p>}
    </section>
    <section>
      <h2>Help with an order</h2>
      <p>Include your order reference and a short description of what you need. Use the same phone number you provided at checkout when you track an order.</p>
      <p><Link href="/track">Track an order</Link> · <Link href="/returns">Report a problem with an item</Link></p>
    </section>
    <section>
      <h2>Wholesale and delivery</h2>
      <p>Send a <Link href="/wholesale">wholesale enquiry</Link> with the products and quantities you need, or check the <Link href="/delivery">delivery options</Link> for your area.</p>
    </section>
  </StoreInformation>;
}
