import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { StoreInformation } from "@/components/store-information";
import { getBusinessDetails } from "@/lib/business-server";
import { checkoutPolicy } from "@/lib/checkout-policy";
import { naira, type DeliverySettings } from "@/lib/commerce";
import { canonicalMetadata } from "@/lib/site-url";
import { getDeliverySettings } from "@/lib/delivery-server";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about ordering groceries, nationwide delivery, payments, returns and wholesale quotes.",
  ...canonicalMetadata("/faq"),
};

const faqGroups = (delivery: DeliverySettings, wholesaleResponse: string) => {
  const payment = checkoutPolicy();
  return [
  {
    title: "Shopping and delivery",
    questions: [
      {
        question: "Where do you deliver?",
        answer: <p>Checkout calculates delivery for the listed Lagos areas. For other locations in Nigeria, share your basket, state and town or LGA for a delivery quote. See <Link href="/delivery">delivery fees and estimates</Link>.</p>,
      },
      {
        question: "How much does delivery cost?",
        answer: <p>Delivery is free on orders from {naira(delivery.freeFrom)} in the Lagos areas listed at checkout. For other locations, we confirm the delivery fee and estimated arrival when you request a quote.</p>,
      },
      {
        question: "How do I pay?",
        answer: <>
          {payment.options && <p>{payment.options}</p>}
          {payment.sandbox && <p>This store uses simulated payments through Bachs. Simulated transactions do not result in delivery.</p>}
          {!payment.options && !payment.sandbox && <p>Check the options shown at checkout or contact us.</p>}
        </>,
      },
      {
        question: "What does Price on request mean?",
        answer: <p>Ask for a <Link href="/wholesale">carton or wholesale quote</Link> so our team can confirm the price, carton contents and availability.</p>,
      },
    ],
  },
  {
    title: "Order help and wholesale",
    questions: [
      {
        question: "How do I track my order?",
        answer: <p>Save the reference shown when you place your order. Enter it and the phone number you used at checkout on the <Link href="/track">Track order</Link> page.</p>,
      },
      {
        question: "Can I change or cancel my order?",
        answer: <p><Link href="/contact">Contact Imperial</Link> as soon as possible with your order reference. Our team checks the order’s dispatch status and explains the available options. See <Link href="/returns#cancellations">cancellations and returns</Link> for details.</p>,
      },
      {
        question: "What if an item is damaged, missing, incorrect or spoiled?",
        answer: <p>Contact us promptly with your reference, the item and affected quantity. A photo of the packaging or batch label can help if you can take one safely. See <Link href="/returns">returns and refunds</Link> for how we review reports.</p>,
      },
      {
        question: "Can I buy by the carton or case?",
        answer: <>
          <p>Yes. On the <Link href="/wholesale">Wholesale</Link> page, select your products and quantities, and tell us where delivery is needed. Save your reference after your request is stored. The team can then confirm pack contents, bulk prices, availability and delivery.</p>
          {wholesaleResponse && <p>{wholesaleResponse}</p>}
        </>,
      },
    ],
  },
  ];
};

export default async function FaqPage() {
  const [business, delivery] = await Promise.all([getBusinessDetails(), getDeliverySettings()]);
  const groups = faqGroups(delivery, business.wholesaleResponse);
  return <StoreInformation current="/faq" description="Find answers about orders, nationwide delivery, returns and wholesale quotes.">
    {groups.map((group) => <section key={group.title} className="faq-group">
      <h2>{group.title}</h2>
      {group.questions.map(({ question, answer }) => <details key={question}>
        <summary>{question}<ChevronDown size={19} aria-hidden="true"/></summary>
        {answer}
      </details>)}
    </section>)}
  </StoreInformation>;
}
