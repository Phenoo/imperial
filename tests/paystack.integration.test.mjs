import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";

if (!process.env.FIREBASE_PROJECT_ID?.startsWith("demo-") ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")) {
  throw new Error("Paystack integration tests require both local Firebase emulators and a demo project.");
}
process.env.PAYSTACK_SECRET_KEY = "sk_test_disposable_fixture";
process.env.STORE_URL = "https://www.imperialgroupfoodsng.com";
process.env.STORE_DEMO_CATALOG = "1";
delete process.env.PAYSTACK_WEBHOOK_SECRET;

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next("next/dist/compiled/server-only/empty.js", context);
  if (specifier === "next/cache") return next("next/cache.js", context);
  if (context.parentURL?.endsWith(".ts") && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });

const { database } = await import("../lib/firebase-server.ts");
const { reserveOnlineOrder, findOnlineOrder, applyOnlinePayment, updateOrderStatus, trackOrder } = await import("../lib/store-server.ts");
const { beginOnlineCheckout, reconcileOnlineOrder, receivePaystackWebhook, validPaystackSignature } = await import("../lib/paystack.ts");
const { onlinePaymentProvider, onlinePaymentMode } = await import("../lib/payments.ts");
const { reliableFulfilment } = await import("../lib/order-operations.ts");

test("Paystack signatures reject altered, stale and downgraded webhooks", () => {
  const raw = Buffer.from('{"event":"charge.success"}');
  const key = process.env.PAYSTACK_SECRET_KEY;
  const digest = createHmac("sha512", key).update(raw).digest("hex");
  const legacy = new Headers({ "x-paystack-signature": digest });
  assert.equal(validPaystackSignature(raw, legacy, key), true);
  assert.equal(validPaystackSignature(Buffer.from("altered"), legacy, key), false);
  assert.equal(validPaystackSignature(raw, new Headers({ "x-paystack-signature": "bad" }), key), false);
  const now = Date.now();
  const timestamp = Math.floor(now / 1000);
  const secret = "whsec_disposable_fixture";
  const signature = createHmac("sha512", secret).update(`${timestamp}.`).update(raw).digest("hex");
  const modern = new Headers({ "paystack-signature": `t=${timestamp},v1=fixture:${signature}` });
  assert.equal(validPaystackSignature(raw, modern, key, secret, now), true);
  assert.equal(validPaystackSignature(raw, modern, key, secret, now + 301000), false);
  assert.equal(validPaystackSignature(raw, modern, key), false);
  assert.equal(validPaystackSignature(raw, legacy, key, secret), false);
  const dual = new Headers(modern);
  dual.set("x-paystack-signature", digest);
  assert.equal(validPaystackSignature(raw, dual, key), true);
  assert.equal(validPaystackSignature(raw, dual, key, secret, now), true);
  dual.set("paystack-signature", `t=${timestamp},v1=fixture:${"0".repeat(128)}`);
  assert.equal(validPaystackSignature(raw, dual, key, secret, now), false);
});

test("sandbox checkout, verified callbacks and inventory are consistent", { timeout: 90000 }, async (t) => {
  const db = database();
  const id = `paystack-fixture-${randomUUID().slice(0, 8)}`;
  const item = db.collection("products").doc(id);
  const orders = [];
  const keys = [];
  const realFetch = globalThis.fetch;
  let handler = () => { throw new Error("Unexpected gateway request"); };
  globalThis.fetch = (input, init) => String(input).startsWith("https://api.paystack.co/")
    ? Promise.resolve(handler(String(input), init)) : realFetch(input, init);
  t.after(async () => {
    globalThis.fetch = realFetch;
    const batch = db.batch();
    batch.delete(item);
    for (const order of orders) {
      batch.delete(db.collection("orders").doc(order.id));
      const events = await db.collection("inventoryEvents").where("orderId", "==", order.id).get();
      for (const event of events.docs) batch.delete(event.ref);
    }
    for (const key of keys) batch.delete(db.collection("orderRequests").doc(key));
    await batch.commit();
  });
  await item.create({
    id, name: "Paystack disposable fixture", brand: "Fixture", category: "rice", origin: "", size: "5 kg",
    saleUnit: "bag", price: 10000, stock: 20, stockVerified: true, checkoutApproved: true, purchaseMode: "retail",
    comparePrice: null, rank: 99999, image: "/images/tilda.webp", description: "Disposable emulator-only product.", active: true, featured: false,
  });
  const customer = { name: "Local test customer", phone: "08012345678", email: "customer@imperial.test", address: "Local emulator address", zone: "island", notes: "Disposable fixture" };
  async function reserve() {
    const key = randomUUID();
    keys.push(key);
    const request = { key, customer, items: [{ productId: id, quantity: 2, price: 10000 }] };
    const order = await reserveOnlineOrder(request, { provider: "paystack", simulated: true });
    orders.push(order);
    return { order, request };
  }
  function verified(order, changes = {}) {
    handler = () => Response.json({ status: true, data: { reference: order.id, status: "success", amount: order.total * 100, currency: "NGN", domain: "test", ...changes } });
  }
  async function stock() { return (await item.get()).get("stock"); }

  await t.test("server totals include delivery and retries reserve stock once", async () => {
    assert.equal(onlinePaymentProvider(), "paystack");
    assert.equal(onlinePaymentMode(), "sandbox");
    const { order, request } = await reserve();
    assert.equal(order.payment.provider, "paystack");
    assert.equal(order.simulated, true);
    assert.equal(order.shipping, 3000);
    assert.equal(await stock(), 18);
    assert.equal((await reserveOnlineOrder(request, { provider: "paystack", simulated: true })).id, order.id);
    assert.equal(await stock(), 18);
    handler = (url, init) => {
      assert.equal(url, "https://api.paystack.co/transaction/initialize");
      const payload = JSON.parse(init.body);
      assert.equal(payload.amount, "2300000");
      assert.equal(payload.email, customer.email);
      assert.equal(payload.reference, order.id);
      assert.equal(payload.callback_url, `https://www.imperialgroupfoodsng.com/checkout/result?ref=${order.id}`);
      return Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/fixture", access_code: "fixture", reference: order.id } });
    };
    assert.equal(await beginOnlineCheckout(order), "https://checkout.paystack.com/fixture");
    assert.equal(await beginOnlineCheckout(await findOnlineOrder(order.id)), "https://checkout.paystack.com/fixture");
    assert.equal((await findOnlineOrder(order.id)).payment.provider, "paystack");
  });

  await t.test("email is required; amount, currency, reference and environment must match", async () => {
    const order = orders[0];
    await assert.rejects(beginOnlineCheckout({ ...order, customer: { ...customer, email: "" } }), /email address/);
    for (const changes of [{ amount: 1 }, { currency: "USD" }, { reference: "other" }, { domain: "live" }]) {
      verified(order, changes);
      await assert.rejects(reconcileOnlineOrder(order), /could not be matched/);
      assert.equal((await findOnlineOrder(order.id)).payment.status, "pending");
    }
    verified(order);
    const paid = await reconcileOnlineOrder(order);
    assert.equal(paid.payment.status, "paid");
    assert.equal(paid.payment.provider, "paystack");
    assert.equal(reliableFulfilment(paid), false);
    await assert.rejects(updateOrderStatus(order.id, "confirmed", "fixture-staff"), /simulated|test/i);
  });

  await t.test("signed webhooks reverify with Paystack and duplicates do not change stock", async () => {
    const order = orders[0];
    verified(order);
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: order.id, amount: 1 } }));
    const headers = new Headers({ "x-paystack-signature": createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex") });
    const before = await stock();
    await Promise.all([receivePaystackWebhook(raw, headers), receivePaystackWebhook(raw, headers)]);
    assert.equal(await stock(), before);
    await assert.rejects(receivePaystackWebhook(raw, new Headers()), /signature/);
    const tracked = await trackOrder(order.id, customer.phone);
    assert.equal(tracked.paymentStatus, "paid");
    assert.equal(tracked.mode, "simulated");
    await assert.rejects(trackOrder(order.id, "08099999999"));
  });

  await t.test("failed payments release stock once and late success re-reserves once", async () => {
    const before = await stock();
    const { order } = await reserve();
    verified(order, { status: "failed" });
    const expired = await reconcileOnlineOrder(order);
    assert.equal(expired.payment.status, "expired");
    await reconcileOnlineOrder(order);
    assert.equal(await stock(), before);
    verified(order);
    assert.equal((await reconcileOnlineOrder(expired)).payment.status, "paid");
    await reconcileOnlineOrder(expired);
    assert.equal(await stock(), before - 2);
  });

  await t.test("changed pack specifications on a late payment require review", async () => {
    const { order } = await reserve();
    const expired = await applyOnlinePayment(order.id, order.id, "expired");
    await item.update({ size: "10 kg" });
    const before = await stock();
    verified(order);
    assert.equal((await reconcileOnlineOrder(expired)).payment.status, "refund_required");
    assert.equal(await stock(), before);
    await item.update({ size: "5 kg" });
  });

  await t.test("ambiguous initialization errors preserve the reservation for retry", async () => {
    const { order } = await reserve();
    const before = await stock();
    handler = () => Response.json({ status: false, message: "Server error" }, { status: 500 });
    await assert.rejects(beginOnlineCheckout(order));
    assert.equal((await findOnlineOrder(order.id)).payment.status, "pending");
    assert.equal(await stock(), before);
    handler = () => Response.json({ status: false, message: "Invalid key" }, { status: 401 });
    await assert.rejects(beginOnlineCheckout(order));
    assert.equal((await findOnlineOrder(order.id)).payment.status, "expired");
    assert.equal(await stock(), before + 2);
  });
});
