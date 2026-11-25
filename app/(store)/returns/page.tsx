import type { Metadata } from "next";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { SupportLinks } from "@/components/support-links";
import { getBusinessDetails } from "@/lib/business-server";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Returns & refunds",
  description: "Find out how to request a cancellation or report missing, wrong, damaged or spoiled groceries.",
  ...canonicalMetadata("/returns"),
};

export default async function ReturnsPage() {
  const business = await getBusinessDetails();
  return <StoreInformation current="/returns" description="How to report an order problem or ask for a cancellation, replacement or refund.">
    <section id="cancellations">
      <h2>Change or cancel an order</h2>
      <p>Contact us as soon as you can with your order reference and what you want to change. The team checks whether the order has been prepared or dispatched and explains the options for its current stage.</p>
    </section>
    <section>
      <h2>Missing, wrong, damaged or spoiled items</h2>
      <p>Tell us promptly about the issue. Include the order reference, product name and affected quantity. A photograph of the product, packaging or batch label can help us identify the item when you can take one safely.</p>
      <p>Keep unsafe food separate and avoid consuming it. For help with safe handling or collection of the item, contact the team.</p>
      <p>We review your report against the order and discuss the appropriate resolution, such as supplying a missing item, replacing an item or arranging any refund due. Your rights under Nigerian consumer law apply.</p>
    </section>
    <section>
      <h2>Unavailable products and substitutions</h2>
      <p>Where something becomes unavailable, the team can confirm your options. Any proposed alternative needs your approval before we substitute it.</p>
    </section>
    <section>
      <h2>Refund questions</h2>
      <p>The team will explain the agreed resolution and expected timing for your case.</p>
      {business.refundProcessing && <p>{business.refundProcessing}</p>}
      <p><Link href="/contact">Contact Imperial</Link> with your order reference.</p>
      <SupportLinks business={business}/>
      <p>For independent help with a consumer complaint, visit the <a href="https://fccpc.gov.ng/consumers/complaint-handling/">Federal Competition and Consumer Protection Commission</a>.</p>
    </section>
  </StoreInformation>;
}
