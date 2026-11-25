import type { Metadata } from "next";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { SupportLinks } from "@/components/support-links";
import { getBusinessDetails } from "@/lib/business-server";
import { checkoutPolicy } from "@/lib/checkout-policy";
import { canonicalMetadata } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "How Imperial Foods & Beverages handles retail orders, payment, delivery, cancellations, returns and wholesale quotes.",
  ...canonicalMetadata("/terms"),
};

export default async function TermsPage() {
  const business = await getBusinessDetails();
  const payment = checkoutPolicy();
  return <StoreInformation current="/terms" description="How ordering, payment, delivery and returns work at Imperial Foods & Beverages.">
    <section>
      <h2>Orders and payment</h2>
      <p>Review the products, quantities, delivery address and phone number before placing your order. Keep the order reference shown at checkout. Our team may use your contact details to confirm the order or resolve an issue with availability.</p>
      <p>Prices are shown in Nigerian naira. Checkout shows the available options for your location and a delivered total when a fee is known. {payment.options}</p>
      {payment.sandbox && <p>Online payments on this store run in the {payment.provider} test environment. Simulated transactions do not charge you or result in delivery.</p>}
    </section>
    <section>
      <h2>Delivery</h2>
      <p>Checkout shows the fees and estimates for the <Link href="/delivery">listed Lagos areas</Link>. Delivery for other locations in Nigeria requires a quote to confirm the fee and estimate before an order is agreed.</p>
      <p>For an order placed through the site, you can <Link href="/track">check its status</Link> using your reference and checkout phone number.</p>
    </section>
    <section id="cancellations">
      <h2>Cancellations, returns and refunds</h2>
      <p>Contact us promptly with your order reference. See <Link href="/returns">returns and refunds</Link> for how to request a cancellation and report missing, wrong, damaged or spoiled products.</p>
      <p>The team reviews the order and any applicable remedy. Where a product is unavailable, we seek your approval before substituting it. Your rights under applicable Nigerian consumer law apply.</p>
    </section>
    <section>
      <h2>Wholesale purchases</h2>
      <p>A <Link href="/wholesale">wholesale enquiry</Link> lets us review your product list and quantities. Save your reference to follow up. Before you agree to a wholesale purchase, confirm the quoted pack sizes, price, quantities, delivery and quote validity.</p>
    </section>
    <section id="order-help">
      <h2>Get help with an order</h2>
      <p><Link href="/contact">Contact Imperial</Link> with your order or quote reference and a short description of the issue.</p>
      <SupportLinks business={business}/>
      <p>You may also contact the <a href="https://fccpc.gov.ng/consumers/complaint-handling/">Federal Competition and Consumer Protection Commission</a> about a consumer complaint.</p>
    </section>
  </StoreInformation>;
}
