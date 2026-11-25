import { paymentProviderName } from "@/lib/commerce";
import { onlinePaymentProvider } from "@/lib/payments";
import type { Metadata } from "next";
import Link from "next/link";
import { StoreInformation } from "@/components/store-information";
import { SupportLinks } from "@/components/support-links";
import { getBusinessDetails } from "@/lib/business-server";
import { canonicalMetadata } from "@/lib/site-url";
import { AnalyticsPreferences } from "@/components/site-analytics";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn what Imperial Foods & Beverages collects, how it uses order and quote information, and how to exercise your privacy rights.",
  ...canonicalMetadata("/privacy"),
};

export default async function PrivacyPage() {
  const business = await getBusinessDetails();
  return <StoreInformation current="/privacy" description="How Imperial Foods & Beverages uses your information when you shop or request a quote.">
    <section>
      <h2>Information we collect</h2>
      <ul>
        <li><strong>Retail orders.</strong> Your name, phone number, delivery address and area, products and quantities, order total and status, and any email address or delivery notes you choose to share.</li>
        <li><strong>Wholesale requests.</strong> Your name, phone number, delivery town or area, requested products and quantities, and any business name, email address or notes you choose to share.</li>
        <li><strong>Order tracking.</strong> We use your order reference and checkout phone number to verify your request and show the order status.</li>
        <li><strong>Support and feedback.</strong> We may keep the information you share about a product, order or enquiry so we can respond and keep track of the issue. We publish testimonials only with permission, including separate permission for your name or photo.</li>
      </ul>
    </section>
    <section>
      <h2>How we use this information</h2>
      <p>We use your details to prepare and deliver orders, respond to quote requests, answer questions and resolve issues. We process information to fulfil an order or take steps you ask us to take before a purchase. We also use information to secure the store and keep records where the law requires them.</p>
    </section>
    <section>
      <h2>Who can access it</h2>
      <p>Authorised Imperial staff use order and quote records to do their work. Firebase provides database and authentication services. Our hosting and delivery providers may receive the information they need to provide those services. We may also disclose information when the law requires it.</p>
      <p>For online payment, {paymentProviderName(onlinePaymentProvider())} collects your payment details on its hosted checkout. Imperial receives the payment reference and status. If you provide an email address and order emails are enabled, our email provider uses it to deliver your receipt and tracking link.</p>
      <p>When you open WhatsApp to request a delivery quote, the message includes the state and delivery area you entered and the products, packs and quantities in your basket. Review the draft in WhatsApp before sending it to Imperial.</p>
      <p>If a provider processes personal information outside Nigeria, we use a transfer basis permitted by the Nigeria Data Protection Act.</p>
    </section>
    <section>
      <h2>Browser storage and retention</h2>
      <p>Your browser stores the basket, saved products, shopping lists and selected delivery area on your device. You can clear them in your browser’s site settings. Staff sign-in uses browser session storage.</p>
      {process.env.NEXT_PUBLIC_STORE_ANALYTICS === "1" && <p>We count shopping interactions such as searches, basket changes and quote link clicks. These counts exclude search text, contact details and order references.</p>}
      {process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && <>
        <p>If you allow analytics, Google Analytics uses cookies and device and visit information to help us understand public page visits and shopping interactions. We exclude contact details, search text, order references and private pages from this tracking. Advertising personalisation is disabled. You can decline or withdraw permission here. Your choice does not affect your ability to shop.</p>
        <AnalyticsPreferences/>
      </>}
      <p>We retain order, quote and support records while they are needed for fulfilment, customer service and disputes, and for any applicable legal recordkeeping period. Contact us if you want to withdraw permission for a published testimonial.</p>
    </section>
    <section id="privacy-contact">
      <h2>Your privacy rights</h2>
      <p>Under the Nigeria Data Protection Act, you may ask to access, correct or erase your personal information, restrict or object to certain uses, or request a portable copy where applicable. We may verify your identity before responding.</p>
      <p>Use the channels below or visit <Link href="/contact">Contact Imperial</Link> to ask about your data. You may also lodge a complaint with the <a href="https://ndpc.gov.ng/">Nigeria Data Protection Commission</a>.</p>
      <SupportLinks business={business} privacy/>
    </section>
  </StoreInformation>;
}
