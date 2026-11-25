import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Order } from "./commerce";
import { firebaseProjectId } from "./firebase-server";
import { storeUrl } from "./site-url";
import { applyOnlinePayment, attachOnlineCheckout, findOnlineOrder, StoreError } from "./store-server";
import { orderId } from "./validation";

const initialization = z.object({ status: z.literal(true), data: z.object({
  authorization_url: z.url(), access_code: z.string().min(1), reference: z.string(),
}) });
const verification = z.object({ status: z.literal(true), data: z.object({
  reference: z.string(), status: z.string(), amount: z.number().int().nonnegative(), currency: z.string(),
  domain: z.enum(["test", "live"]),
}) });

function settings() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  const url = storeUrl();
  const project = firebaseProjectId();
  if (!key || !url?.startsWith("https://") || !project) return null;
  if (key.startsWith("sk_test_")) return { key, url, sandbox: true };
  if (key.startsWith("sk_live_") && process.env.STORE_DEMO_CATALOG !== "1" && !project.startsWith("demo-")) return { key, url, sandbox: false };
  return null;
}

export function onlinePaymentMode() {
  const config = settings();
  return config ? config.sandbox ? "sandbox" : "live" : null;
}

class PaystackError extends StoreError {
  constructor(readonly upstreamStatus: number, readonly duplicate = false) {
    super("Paystack checkout is temporarily unavailable. Please try again with the same details.", 502);
  }
}

async function gateway(path: string, options: RequestInit = {}) {
  const config = settings();
  if (!config) throw new StoreError("Paystack is not configured for this storefront.", 503);
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options, headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  }).catch(() => { throw new PaystackError(0); });
  const payload: unknown = await response.json().catch(() => { throw new PaystackError(response.status); });
  const envelope = z.object({ status: z.boolean(), message: z.string().optional() }).safeParse(payload);
  if (!response.ok || !envelope.success || !envelope.data.status) {
    console.warn("Paystack request rejected", { operation: path.startsWith("/transaction/initialize") ? "initialize" : "verify", status: response.status });
    throw new PaystackError(response.status, envelope.success && /duplicate.*reference|reference.*already/i.test(envelope.data.message ?? ""));
  }
  return payload;
}

function resultUrl(order: Order, origin: string) {
  const result = new URL("/checkout/result", origin);
  result.searchParams.set("ref", order.id);
  return result.href;
}

export async function beginOnlineCheckout(order: Order) {
  const config = settings();
  if (!config) throw new StoreError("Paystack is not configured for this storefront.", 503);
  if (order.payment?.provider !== "paystack" || order.payment.checkoutId !== order.id) throw new StoreError("This payment reference is unavailable.", 409);
  if (order.payment.status === "paid") return resultUrl(order, config.url);
  if (order.payment.status !== "pending" || Date.parse(order.payment.expiresAt ?? "") <= Date.now()) throw new StoreError("That payment window closed. Please start a new checkout.", 409);
  if (order.payment.checkoutUrl) return order.payment.checkoutUrl;
  if (!z.email().safeParse(order.customer.email).success) throw new StoreError("Enter an email address for Paystack checkout.", 400);
  let payload: unknown;
  try {
    payload = await gateway("/transaction/initialize", {
      method: "POST", body: JSON.stringify({
        email: order.customer.email, amount: String(order.total * 100), currency: "NGN", reference: order.id,
        callback_url: resultUrl(order, config.url), metadata: { order_id: order.id, cancel_action: resultUrl(order, config.url) },
      }),
    });
  } catch (error) {
    if (error instanceof PaystackError && error.duplicate) {
      const current = await findOnlineOrder(order.id);
      if (current?.payment?.checkoutUrl) return current.payment.checkoutUrl;
      const verified = await reconcileOnlineOrder(current ?? order);
      if (verified.payment?.status === "paid") return resultUrl(verified, config.url);
      throw new StoreError(`Checkout ${order.id} is being prepared or is awaiting confirmation. Try again with the same details.`, 503);
    }
    if (error instanceof PaystackError && [400, 401, 403, 422].includes(error.upstreamStatus)) await applyOnlinePayment(order.id, order.id, "expired");
    throw error;
  }
  const parsed = initialization.safeParse(payload);
  if (!parsed.success || parsed.data.data.reference !== order.id) {
    console.warn("Paystack initialization returned an unexpected response");
    throw new PaystackError(0);
  }
  const checkout = new URL(parsed.data.data.authorization_url);
  if (checkout.protocol !== "https:" || checkout.host !== "checkout.paystack.com" || checkout.username || checkout.password) throw new PaystackError(0);
  await attachOnlineCheckout(order.id, order.id, checkout.href, order.payment.expiresAt!);
  return checkout.href;
}

export async function reconcileOnlineOrder(order: Order) {
  const config = settings();
  if (!config) throw new StoreError("Paystack is not configured for this storefront.", 503);
  if (order.payment?.provider !== "paystack" || order.payment.checkoutId !== order.id) return order;
  let payload: unknown;
  try { payload = await gateway(`/transaction/verify/${encodeURIComponent(order.id)}`); }
  catch (error) {
    if (error instanceof PaystackError && error.upstreamStatus === 404 && Date.parse(order.payment.expiresAt ?? "") <= Date.now()) {
      return (await applyOnlinePayment(order.id, order.id, "expired")) ?? order;
    }
    throw error;
  }
  const parsed = verification.safeParse(payload);
  if (!parsed.success) throw new PaystackError(0);
  const payment = parsed.data.data;
  if (payment.reference !== order.id || payment.currency !== "NGN" || payment.amount !== order.total * 100 ||
      payment.domain !== (config.sandbox ? "test" : "live") || (payment.domain === "test" && order.simulated !== true)) {
    throw new StoreError("The payment could not be matched to this order.", 409);
  }
  if (payment.status === "success") return (await applyOnlinePayment(order.id, order.id, "paid")) ?? order;
  if (payment.status === "reversed") return (await applyOnlinePayment(order.id, order.id, "refunded")) ?? order;
  if (["failed", "abandoned"].includes(payment.status) || Date.parse(order.payment.expiresAt ?? "") <= Date.now()) {
    return (await applyOnlinePayment(order.id, order.id, "expired")) ?? order;
  }
  return order;
}

export function validPaystackSignature(raw: Buffer, headers: Headers, key: string, signingSecret?: string, now = Date.now()) {
  const signed = headers.get("paystack-signature");
  if (signed && signingSecret) {
    const fields = signed.split(",").map((part) => part.trim());
    const timestamps = fields.filter((part) => part.startsWith("t="));
    const timestamp = timestamps[0]?.slice(2);
    if (timestamps.length !== 1 || !timestamp || !/^\d{10,11}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
    const expected = createHmac("sha512", signingSecret).update(timestamp + ".").update(raw).digest();
    return fields.filter((part) => part.startsWith("v1=")).some((part) => {
      const value = part.slice(3);
      const colon = value.indexOf(":");
      const signature = value.slice(colon + 1);
      return colon > 0 && /^[a-f0-9]{128}$/.test(signature) && timingSafeEqual(expected, Buffer.from(signature, "hex"));
    });
  }
  if (signingSecret) return false;
  const signature = headers.get("x-paystack-signature");
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha512", key).update(raw).digest(), Buffer.from(signature, "hex"));
}

export async function receivePaystackWebhook(raw: Buffer, headers: Headers) {
  const config = settings();
  if (!config) throw new StoreError("Paystack is not configured for this storefront.", 503);
  const signingSecret = process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
  if (!validPaystackSignature(raw, headers, config.key, signingSecret)) {
    console.warn("Paystack webhook signature rejected", { modernHeader: headers.has("paystack-signature"), legacyHeader: headers.has("x-paystack-signature"), signingSecretConfigured: Boolean(signingSecret) });
    throw new StoreError("Invalid webhook signature.", 401);
  }
  let value: unknown;
  try { value = JSON.parse(raw.toString("utf8")); } catch { throw new StoreError("Invalid webhook payload.", 400); }
  const event = z.object({ event: z.string(), data: z.object({ reference: z.string().optional(), transaction: z.object({ reference: z.string() }).optional() }) }).safeParse(value);
  if (!event.success || !["charge.success", "refund.processed"].includes(event.data.event)) return null;
  const reference = orderId.safeParse(event.data.data.reference ?? event.data.data.transaction?.reference);
  if (!reference.success) return null;
  const order = await findOnlineOrder(reference.data);
  if (!order || order.payment?.provider !== "paystack") return null;
  return reconcileOnlineOrder(order);
}
