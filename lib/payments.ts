import "server-only";
import * as bachs from "./bachs";
import * as paystack from "./paystack";
import type { Order, PaymentProvider } from "./commerce";
import { applyOnlinePayment, pendingOnlineOrders } from "./store-server";

export function onlinePaymentProvider(): PaymentProvider {
  return process.env.PAYSTACK_SECRET_KEY?.trim() ? "paystack" : "bachs";
}

export function onlinePaymentMode() {
  return onlinePaymentProvider() === "paystack" ? paystack.onlinePaymentMode() : bachs.onlinePaymentMode();
}

export function beginOnlineCheckout(order: Order) {
  return order.payment?.provider === "paystack" ? paystack.beginOnlineCheckout(order) : bachs.beginOnlineCheckout(order);
}

export function reconcileOnlineOrder(order: Order) {
  return order.payment?.provider === "paystack" ? paystack.reconcileOnlineOrder(order) : bachs.reconcileOnlineOrder(order);
}

export async function releaseExpiredCheckouts() {
  const pending = await pendingOnlineOrders();
  const results = await Promise.allSettled(pending.map((order) => order.payment?.checkoutId
    ? reconcileOnlineOrder(order)
    : applyOnlinePayment(order.id, undefined, "expired")));
  if (results.some((result) => result.status === "rejected")) console.warn("Some expired checkouts could not be reconciled.");
}
