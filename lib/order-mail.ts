import "server-only";
import { naira, type Order, type OrderStatus } from "./commerce";
import { database } from "./firebase-server";
import { fulfilmentStatusLabel, reliableFulfilment } from "./order-operations";
import { storeUrl } from "./site-url";
import { isDemoStore } from "./store-settings";

function emailSettings() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.STORE_ORDER_FROM?.trim();
  const url = storeUrl();
  if (!key || !from || !url || process.env.FIREBASE_PROJECT_ID?.startsWith("demo-")) return null;
  return { key, from, url };
}

function sendOrderEmail(config: NonNullable<ReturnType<typeof emailSettings>>, to: string, subject: string, text: string, idempotencyKey: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: config.from, to: [to], subject, text }),
    signal: AbortSignal.timeout(4000),
  });
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
    const link = new URL(`/track?ref=${id}`, config.url);
    const text = [
      `Order ${id} · Imperial Foods & Beverages`,
      ...order.items.map((item) => `${item.quantity} × ${item.name}${item.size ? ` (${item.size})` : ""} — ${naira(item.quantity * item.price)}`),
      `Delivery: ${naira(order.shipping)}`,
      `Total: ${naira(order.total)}`,
      order.payment ? "Payment confirmed." : "Please pay when your order arrives.",
      `Track your order: ${link.href}`,
    ].join("\n");
    const response = await sendOrderEmail(config, order.customer.email, `Imperial order ${id}`, text, `imperial-receipt/${id}`);
    if (!response.ok) {
      console.warn("Order receipt provider returned", response.status);
      return;
    }
    await reference.update({ receiptSentAt: new Date().toISOString() });
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
    const link = new URL(`/track?ref=${id}`, config.url);
    const text = [`Imperial order ${id}`, `Order update: ${stage}`, `Track your order: ${link.href}`].join("\n");
    const response = await sendOrderEmail(config, details.email, `Imperial order update: ${stage}`, text, `imperial-fulfilment/${id}/${status}`);
    if (!response.ok) {
      console.warn("Order update email provider returned", response.status);
      return;
    }
    await notice.update({ sentAt: new Date().toISOString() });
  } catch {
    console.warn("Order update email delivery could not be confirmed.");
  }
}
