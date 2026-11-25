import "server-only";
import { z } from "zod";
import type { Order, OrderStatus } from "./commerce";
import { database } from "./firebase-server";
import { fulfilmentEmailContent, orderReceiptContent, type OrderEmailContent } from "./order-email-content";
import { fulfilmentStatusLabel, reliableFulfilment } from "./order-operations";
import { storeUrl } from "./site-url";
import { isDemoStore } from "./store-settings";

function emailSettings() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.STORE_ORDER_FROM?.trim();
  const replyTo = process.env.STORE_ORDER_REPLY_TO?.trim();
  const url = storeUrl();
  if (!key || !from || !url || (replyTo && !z.email().safeParse(replyTo).success) || process.env.FIREBASE_PROJECT_ID?.startsWith("demo-")) return null;
  return { key, from, replyTo, url };
}

async function sendOrderEmail(config: NonNullable<ReturnType<typeof emailSettings>>, to: string, content: OrderEmailContent, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: config.from, to: [to], ...content, ...(config.replyTo && { reply_to: config.replyTo }) }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    console.warn("Order email provider returned", response.status);
    return null;
  }
  const result: unknown = await response.json();
  return result && typeof result === "object" && "id" in result && typeof result.id === "string" && result.id.trim() ? result.id : null;
}

export async function sendOrderReceipt(id: string) {
  const config = emailSettings();
  if (!config) return;
  try {
    const reference = database().collection("orders").doc(id);
    const order = await database().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.get("receiptSentAt") || Number(snapshot.get("receiptLeaseUntil") ?? 0) > Date.now()) return null;
      const entry = snapshot.data() as Order;
      if (!entry.customer.email || !reliableFulfilment(entry, isDemoStore()) || entry.status === "cancelled" || (entry.payment && entry.payment.status !== "paid")) return null;
      transaction.update(reference, { receiptLeaseUntil: Date.now() + 60_000 });
      return entry;
    });
    if (!order) return;
    const providerId = await sendOrderEmail(config, order.customer.email, orderReceiptContent(order, config.url), `imperial-receipt/${id}`);
    if (!providerId) return;
    await reference.update({ receiptSentAt: new Date().toISOString(), receiptProviderId: providerId });
  } catch {
    console.warn("Order receipt delivery could not be confirmed.");
  }
}

export async function sendFulfilmentUpdate(id: string, status: OrderStatus) {
  if (status !== "confirmed" && status !== "out_for_delivery" && status !== "delivered") return;
  const config = emailSettings();
  if (!config) return;
  try {
    const db = database();
    const orderRef = db.collection("orders").doc(id);
    const notice = orderRef.collection("notifications").doc(status);
    const details = await db.runTransaction(async (transaction) => {
      const [snapshot, previous] = await transaction.getAll(orderRef, notice);
      if (!snapshot.exists || previous.get("sentAt") || Number(previous.get("leaseUntil") ?? 0) > Date.now()) return null;
      const order = snapshot.data() as Order;
      const event = order.fulfilmentEvents?.findLast((entry) => entry.status === status && entry.staffId);
      if (!event || order.status !== status || !order.customer.email || !reliableFulfilment(order, isDemoStore()) ||
        (order.payment && order.payment.status !== "paid")) return null;
      transaction.set(notice, { status, eventAt: event.at, leaseUntil: Date.now() + 60_000 });
      return { email: order.customer.email };
    });
    if (!details) return;
    const stage = fulfilmentStatusLabel[status];
    const providerId = await sendOrderEmail(config, details.email, fulfilmentEmailContent(id, stage, config.url), `imperial-fulfilment/${id}/${status}`);
    if (!providerId) return;
    await notice.update({ sentAt: new Date().toISOString(), providerId });
  } catch {
    console.warn("Order update email delivery could not be confirmed.");
  }
}
