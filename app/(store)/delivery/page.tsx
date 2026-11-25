import type { Metadata } from "next";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { getBusinessDetails } from "@/lib/business-server";
import { naira } from "@/lib/commerce";
import { canonicalMetadata } from "@/lib/site-url";
import { getDeliverySettings } from "@/lib/delivery-server";

export const metadata: Metadata = {
  title: "Delivery & collection",
  description: "Check eligible Lagos delivery fees and estimates, and request a quote for other locations in Nigeria.",
  ...canonicalMetadata("/delivery"),
};

const kilograms = new Intl.NumberFormat("en-NG", { style: "unit", unit: "kilogram", maximumFractionDigits: 3 });

export default async function DeliveryPage() {
  const [business, delivery] = await Promise.all([getBusinessDetails(), getDeliverySettings()]);
  return <StoreInformation current="/delivery" description="Check Lagos delivery rates or ask for a quote for your location.">
    <section>
      <h2>Delivery in Lagos</h2>
      <dl className="grid gap-3">
        {delivery.zones.map(({ id, name, fee, time }) => <div key={id}>
          <dt className="font-extrabold">{name}</dt><dd>{naira(fee)} · Estimated {time}</dd>
        </div>)}
      </dl>
      <p>Delivery is free from {naira(delivery.freeFrom)} on the product subtotal in the eligible Lagos areas listed above. Choose your area in the basket or at checkout to check the delivery charge for your order.</p>
      {delivery.minimumSubtotal && <p>The minimum product subtotal for Lagos delivery is {naira(delivery.minimumSubtotal)}.</p>}
      {delivery.quoteAboveWeightGrams && <p>For baskets over {kilograms.format(delivery.quoteAboveWeightGrams / 1000)}, or baskets with unconfirmed weights, request a quote to confirm the delivery charge and estimate.</p>}
      <p>Estimates are in business days. Contact us to confirm arrangements for a delivery address outside the listed areas.</p>
    </section>
    <section>
      <h2>Other locations in Nigeria</h2>
      <p>Request a delivery quote with your state, town or LGA, basket items and quantities. The shop team confirms the charge and estimated arrival before you commit to an order.</p>
      <p>When you choose the quote option at checkout, you can review and send your basket summary on WhatsApp. Your message starts an enquiry.</p>
      <p><Link href="/checkout#delivery">Check delivery for your basket</Link> · <Link href="/contact">Contact Imperial</Link></p>
    </section>
    {business.address && business.collectionHours && business.collectionInstructions && <section>
      <h2>Collection</h2>
      <p><strong>Address</strong> {business.address}</p>
      <p><strong>Hours</strong> {business.collectionHours}</p>
      <p>{business.collectionInstructions}</p>
      <p><Link href="/contact">Contact us to arrange collection</Link></p>
    </section>}
  </StoreInformation>;
}
