import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Order } from "./commerce";
import { firebaseProjectId } from "./firebase-server";
import { storeUrl } from "./site-url";
import { applyOnlinePayment, attachOnlineCheckout, findOnlineOrder, pendingOnlineOrders, StoreError } from "./store-server";
import { orderId } from "./validation";

const checkoutId = z.string().regex(/^chk_[a-z\d_-]{1,120}$/i);
const hostedSession = z.object({ checkout_id: checkoutId, checkout_url: z.url(), expires_at: z.iso.datetime({ offset: true }) });
const settledSession = z.object({
  checkout_id: checkoutId,
  status: z.string(),
  payment_status: z.string().nullish(),
  reference: z.string().nullish(),
  amount: z.string(),
  currency: z.string(),
  charge: z.object({ status: z.string() }).nullish(),
});

function settings() {
  const key = process.env.BACHS_API_KEY?.trim();
  const url = storeUrl();
  const project = firebaseProjectId();
  if (!key || !url?.startsWith("https://") || !project) return null;
  if (key.startsWith("sk_sandbox_")) return { key, url, sandbox: true };
  if (key.startsWith("sk_live_") && process.env.BACHS_WEBHOOK_SECRET?.trim() && process.env.STORE_DEMO_CATALOG !== "1" && !project.startsWith("demo-")) {
    return { key, url, sandbox: false };
  }
  return null;
}

export function onlinePaymentMode() {
  const config = settings();
  return config ? (config.sandbox ? "sandbox" : "live") : null;
}

class GatewayError extends StoreError {
  constructor(readonly upstreamStatus: number) {
    super("Online checkout couldn’t reach Bachs. Please try again or pay on delivery.", 502);
  }
}

async function gateway(path: string, init: RequestInit = {}) {
  const config = settings();
  if (!config) throw new StoreError("Online payment is unavailable right now.", 503);
  const origin = config.sandbox ? "https://sandbox-api.bachs.io" : "https://api.bachs.io";
  const response = await fetch(origin + path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${config.key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8500),
  }).catch(() => { throw new GatewayError(0); });
  if (!response.ok) throw new GatewayError(response.status);
  return response.json() as Promise<unknown>;
}

export async function beginOnlineCheckout(order: Order) {
  if (order.payment?.status !== "pending" || Date.parse(order.payment.expiresAt ?? "") <= Date.now()) {
    throw new StoreError("That payment window closed. Please start a new checkout.", 409);
  }
  if (order.payment.checkoutUrl) return order.payment.checkoutUrl;
  const config = settings();
  if (!config) throw new StoreError("Online payment is unavailable right now.", 503);
  const result = new URL("/checkout/result", config.url);
  result.searchParams.set("ref", order.id);
  const cancel = new URL(result);
  cancel.searchParams.set("back", "1");
  const response = await gateway("/v1/checkout-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `imperial-${order.id}` },
    body: JSON.stringify({
      pricing: { currency: "NGN", amount: order.total.toFixed(2), price_type: "fixed" },
      billing_currency: "NGN",
      reference: order.id,
      metadata: { order_id: order.id },
      success_url: result.href,
      cancel_url: cancel.href,
      expires_in_minutes: 20,
    }),
  }).catch(async (error: unknown) => {
    if (error instanceof GatewayError && [400, 401, 403, 422].includes(error.upstreamStatus)) {
      await applyOnlinePayment(order.id, undefined, "expired");
    }
    throw error;
  });
  const session = hostedSession.safeParse(response);
  if (!session.success) throw new GatewayError(0);
  const checkout = new URL(session.data.checkout_url);
  const hosts = config.sandbox ? ["sandbox-checkout.bachs.io", "checkout.bachs.io"] : ["checkout.bachs.io"];
  if (checkout.protocol !== "https:" || checkout.username || checkout.password || !hosts.includes(checkout.host)) throw new GatewayError(0);
  await attachOnlineCheckout(order.id, session.data.checkout_id, checkout.href, new Date(session.data.expires_at).toISOString());
  return checkout.href;
}

export async function reconcileOnlineOrder(order: Order) {
  const reference = order.payment?.checkoutId;
  if (!reference || !checkoutId.safeParse(reference).success) return order;
  const session = settledSession.safeParse(await gateway(`/v1/checkout-sessions/${encodeURIComponent(reference)}`));
  if (!session.success) throw new GatewayError(0);
  const payment = session.data;
  if (payment.checkout_id !== reference || payment.reference !== order.id || payment.currency !== "NGN" ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(payment.amount) || Number(payment.amount) !== order.total) {
    throw new StoreError("The payment could not be matched to this order.", 409);
  }
  const chargeStatus = payment.charge?.status.toLowerCase();
  let next: "paid" | "expired" | "refunded" | "partially_refunded" | undefined;
  if (chargeStatus === "refunded" || chargeStatus === "auto_refunded") next = "refunded";
  else if (chargeStatus === "partially_refunded") next = "partially_refunded";
  else if (payment.status === "completed" && payment.payment_status === "succeeded" && (!chargeStatus || chargeStatus === "succeeded")) next = "paid";
  else if (payment.status === "expired" || payment.status === "cancelled") next = "expired";
  return next ? (await applyOnlinePayment(order.id, reference, next)) ?? order : order;
}

export async function releaseExpiredCheckouts() {
  if (!settings()) return;
  const pending = await pendingOnlineOrders();
  const results = await Promise.allSettled(pending.map((order) => order.payment?.checkoutId
    ? reconcileOnlineOrder(order)
    : applyOnlinePayment(order.id, undefined, "expired")));
  if (results.some((result) => result.status === "rejected")) console.warn("Some expired checkouts could not be reconciled.");
}

const webhookEvent = z.object({
  type: z.string(),
  data: z.object({
    reference: z.string().nullish(),
    checkout_id: checkoutId.nullish(),
    metadata: z.object({ order_id: z.string().nullish() }).nullish(),
  }),
});

function signatureMatches(raw: Buffer, headers: Headers, secret: string) {
  const v2 = headers.get("x-bachs-signature-v2")?.split(",").map((part) => part.trim());
  const timestamp = v2 ? v2.find((part) => part.startsWith("t="))?.slice(2) : headers.get("x-bachs-timestamp");
  const signatures = v2 ? v2.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3)) : [headers.get("x-bachs-signature")];
  if (!timestamp || !/^\d{10,11}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(raw).digest();
  return signatures.some((signature) => signature && /^[a-f0-9]{64}$/i.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex")));
}

export async function receiveBachsWebhook(raw: Buffer, headers: Headers) {
  const secret = process.env.BACHS_WEBHOOK_SECRET?.trim();
  if (!secret || !settings()) throw new StoreError("The Bachs webhook is not configured.", 503);
  if (!signatureMatches(raw, headers, secret)) throw new StoreError("Invalid webhook signature.", 401);
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { throw new StoreError("Invalid webhook payload.", 400); }
  const event = webhookEvent.safeParse(payload);
  if (!event.success || !["collection.succeeded", "checkout.expired", "checkout.completed"].includes(event.data.type)) return null;
  const data = event.data.data;
  const reference = orderId.safeParse(data.reference ?? data.metadata?.order_id);
  if (!reference.success || !data.checkout_id) return null;
  const order = await findOnlineOrder(reference.data);
  if (!order || order.payment?.checkoutId !== data.checkout_id) return null;
  return reconcileOnlineOrder(order);
}
