import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { CheckCircle2, Clock, ShoppingBag } from "lucide-react";
import { PaidBasket } from "@/components/paid-basket";
import { onlinePaymentMode, reconcileOnlineOrder } from "@/lib/bachs";
import { naira, onlinePaymentLabel } from "@/lib/commerce";
import { sendOrderReceipt } from "@/lib/order-mail";
import { orderOperationsMode } from "@/lib/order-operations";
import { findOnlineOrder } from "@/lib/store-server";
import { orderId } from "@/lib/validation";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PaymentResult({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const parsed = orderId.safeParse((await searchParams).ref);
  const order = parsed.success && onlinePaymentMode() ? await findOnlineOrder(parsed.data) : null;
  if (!order?.payment) return <div className="shell subpage"><section className="checkout-success empty-state">
    <ShoppingBag size={44}/><h1>Payment reference unavailable</h1><Link className="button button-green" href="/checkout">Return to checkout</Link>
  </section></div>;

  const updated = order.payment.status === "pending" || order.payment.status === "expired"
    ? await reconcileOnlineOrder(order).catch(() => order)
    : order;
  const payment = updated.payment ?? order.payment;
  const paid = payment.status === "paid";
  if (paid) after(() => sendOrderReceipt(updated.id));
  const mode = orderOperationsMode(updated, onlinePaymentMode() === "sandbox");
  return <div className="shell subpage"><section className="checkout-success empty-state" aria-live="polite">
    {paid ? <CheckCircle2 size={52}/> : <Clock size={48}/>}
    <h1>{mode === "simulated" ? (paid ? "Test payment confirmed" : "Test payment status") : mode === "unconfirmed" ? "Payment reference" : onlinePaymentLabel[payment.status]}</h1>
    <strong className="order-reference">{updated.id}</strong>
    <p>{mode === "simulated" ? payment.status === "pending"
        ? "This is a simulated transaction. Refresh the status after completing the test checkout."
        : "This is a simulated transaction. The test reference can be used for order tracking."
      : mode === "unconfirmed" ? "The original payment environment could not be confirmed. Contact Imperial with this reference for help."
      : paid ? `Your payment of ${naira(updated.total)} was confirmed. Use your reference to track the order.`
      : payment.status === "pending" ? "If you’ve already paid, refresh the status in a moment."
      : payment.status === "expired" ? "The checkout window closed. You can return to your basket to start again."
      : "Keep your reference for any questions about this payment."}</p>
    {paid && <PaidBasket id={updated.id}/>}
    <div className="flex flex-wrap justify-center gap-3">
      {payment.status === "pending" && <form method="get"><input type="hidden" name="ref" value={updated.id}/><button type="submit" className="button button-green">Refresh status</button></form>}
      {payment.status === "pending" && payment.checkoutUrl &&
        <a href={payment.checkoutUrl} rel="noreferrer" className="button button-outline">Return to Bachs</a>}
      {payment.status === "expired" && <Link href="/checkout" className="button button-green">Return to checkout</Link>}
      <Link href={`/track?ref=${updated.id}`} className="button button-outline">Track this order</Link>
    </div>
  </section></div>;
}
