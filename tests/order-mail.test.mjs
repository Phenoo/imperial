import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";

// No Firebase connection or outgoing email is permitted in this suite.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next("next/dist/compiled/server-only/empty.js", context);
  if (specifier === "./firebase-server" && context.parentURL?.endsWith("/lib/order-mail.ts")) {
    return next("data:text/javascript,export function database() { return globalThis[Symbol.for('imperial.email.test.database')]; }", context);
  }
  if (context.parentURL?.endsWith(".ts") && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });

const { sendOrderReceipt, sendFulfilmentUpdate } = await import("../lib/order-mail.ts");
const { orderReceiptContent } = await import("../lib/order-email-content.ts");
const { naira } = await import("../lib/commerce.ts");
const realFetch = globalThis.fetch;
const documents = new Map();
const requests = [];
let provider;
function reference(path) {
  return {
    path,
    collection(name) { return { doc: (id) => reference(`${path}/${name}/${id}`) }; },
    async update(changes) { documents.set(path, { ...documents.get(path), ...changes }); },
  };
}
function snapshot(ref) {
  const data = documents.get(ref.path);
  return { exists: Boolean(data), data: () => data, get: (field) => data?.[field] };
}
globalThis[Symbol.for("imperial.email.test.database")] = {
  collection(name) { assert.equal(name, "orders"); return { doc: (id) => reference(`${name}/${id}`) }; },
  async runTransaction(action) {
    return action({
      get: async (ref) => snapshot(ref),
      getAll: async (...refs) => refs.map(snapshot),
      update: (ref, changes) => { documents.set(ref.path, { ...documents.get(ref.path), ...changes }); },
      set: (ref, data) => { documents.set(ref.path, data); },
    });
  },
};
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.resend.com/emails");
  requests.push({ headers: init.headers, body: JSON.parse(init.body) });
  return provider();
};
after(() => { globalThis.fetch = realFetch; delete globalThis[Symbol.for("imperial.email.test.database")]; });
beforeEach(() => {
  documents.clear(); requests.length = 0;
  process.env.RESEND_API_KEY = "re_disposable_mock_only";
  process.env.STORE_ORDER_FROM = "Imperial Foods & Beverages <orders@imperialgroupfoodsng.com>";
  process.env.STORE_ORDER_REPLY_TO = "support@imperial.test";
  process.env.STORE_URL = "https://www.imperialgroupfoodsng.com";
  process.env.FIREBASE_PROJECT_ID = "isolated-email-unit-test";
  process.env.STORE_DEMO_CATALOG = "1";
  provider = () => Response.json({ id: "provider-accepted-fixture" });
});
function order(changes = {}) {
  return {
    id: "IF-EMAIL-FIXTURE", customer: { name: "Ada", phone: "08012345678", email: "customer@imperial.test", address: "Fixture address", zone: "island", notes: "" },
    items: [{ productId: "fixture", name: "Rice", size: "Carton of 4 × 5 kg bags", quantity: 2, price: 10000 }],
    subtotal: 20000, shipping: 3000, total: 23000, status: "placed", createdAt: "2026-11-25T10:00:00.000Z", updatedAt: "2026-11-25T10:00:00.000Z",
    simulated: false, payment: { provider: "paystack", status: "paid" }, ...changes,
  };
}
function save(entry) { documents.set(`orders/${entry.id}`, entry); return entry; }

test("confirmation contains exact selling units, totals and protected tracking on the branded domain", () => {
  const entry = order();
  const content = orderReceiptContent(entry, process.env.STORE_URL);
  assert.match(content.text, /2 × Rice \(Carton of 4 × 5 kg bags\)/);
  for (const amount of [entry.subtotal, entry.shipping, entry.total]) assert.ok(content.text.includes(naira(amount)));
  assert.match(content.html, /Quantity: 2/);
  assert.match(content.html, /lang="en-NG"/);
  assert.match(content.html, /https:\/\/www\.imperialgroupfoodsng\.com\/track\?ref=IF-EMAIL-FIXTURE/);
  assert.ok(!content.html.includes(entry.customer.phone));
  assert.ok(!content.html.includes(entry.customer.address));
  assert.ok(!orderReceiptContent(order({ payment: undefined }), process.env.STORE_URL).text.includes("pay when"));
});

test("customer and catalogue content cannot inject email HTML or tracking parameters", () => {
  const entry = order({ id: 'IF-&other="injected"', customer: { ...order().customer, name: '<img src=x onerror="bad">' } });
  entry.items[0].name = '<script>bad</script> & "Rice"';
  const content = orderReceiptContent(entry, process.env.STORE_URL);
  assert.ok(!content.html.includes("<script>"));
  assert.ok(!content.html.includes("<img"));
  assert.match(content.html, /&lt;script&gt;bad&lt;\/script&gt;/);
  const tracking = content.text.split("Track your order: ")[1].split("\n")[0];
  assert.deepEqual([...new URL(tracking).searchParams], [["ref", entry.id]]);
});

test("sandbox, unconfirmed, cancelled, unpaid and email-free orders never send receipts or fulfilment mail", async () => {
  const cases = [
    { simulated: true }, { simulated: undefined }, { status: "cancelled" },
    { payment: { provider: "paystack", status: "pending" } },
    { customer: { ...order().customer, email: "" } },
  ];
  for (const changes of cases) {
    const entry = save(order(changes));
    await sendOrderReceipt(entry.id);
    assert.equal(documents.get(`orders/${entry.id}`).receiptSentAt, undefined);
  }
  const entry = save(order({ simulated: true, status: "confirmed", fulfilmentEvents: [{ status: "confirmed", at: "2026-11-25", staffId: "staff-fixture" }] }));
  await sendFulfilmentUpdate(entry.id, "confirmed");
  process.env.STORE_DEMO_CATALOG = "0";
  save(order({ simulated: undefined }));
  await sendOrderReceipt(entry.id);
  assert.equal(requests.length, 0);
});

test("missing configuration and local emulator projects cannot contact the email provider", async () => {
  const entry = save(order());
  for (const name of ["RESEND_API_KEY", "STORE_ORDER_FROM", "STORE_URL"]) {
    const previous = process.env[name]; delete process.env[name];
    // Vercel's fallback origin must also be absent for this missing-origin case.
    const fallback = process.env.VERCEL_URL; delete process.env.VERCEL_URL;
    await sendOrderReceipt(entry.id);
    if (fallback !== undefined) process.env.VERCEL_URL = fallback;
    process.env[name] = previous;
  }
  process.env.FIREBASE_PROJECT_ID = "demo-imperial-pantry";
  await sendOrderReceipt(entry.id);
  process.env.FIREBASE_PROJECT_ID = "isolated-email-unit-test";
  process.env.STORE_ORDER_REPLY_TO = "invalid\r\nBcc: injected@imperial.test";
  await sendOrderReceipt(entry.id);
  assert.equal(requests.length, 0);
});

test("provider acceptance records an ID, reply address and stable duplicate protection", async () => {
  const entry = save(order());
  await sendOrderReceipt(entry.id);
  await sendOrderReceipt(entry.id);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.reply_to, "support@imperial.test");
  assert.equal(requests[0].body.from, process.env.STORE_ORDER_FROM);
  assert.deepEqual(requests[0].body.to, [entry.customer.email]);
  assert.equal(requests[0].headers["Idempotency-Key"], `imperial-receipt/${entry.id}`);
  assert.equal(documents.get(`orders/${entry.id}`).receiptProviderId, "provider-accepted-fixture");
  assert.ok(documents.get(`orders/${entry.id}`).receiptSentAt);
});

test("rejected, malformed and interrupted sends are never recorded as sent", async () => {
  for (const reply of [
    () => Response.json({ message: "Rejected" }, { status: 422 }),
    () => Response.json({}),
    () => { throw new Error("Uncertain transport failure"); },
  ]) {
    const entry = save(order()); provider = reply;
    await sendOrderReceipt(entry.id);
    assert.equal(documents.get(`orders/${entry.id}`).receiptSentAt, undefined);
    assert.equal(documents.get(`orders/${entry.id}`).receiptProviderId, undefined);
  }
});

test("an in-flight send holds the lease against another callback", async () => {
  const entry = save(order());
  let release;
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  provider = () => new Promise((resolve) => { release = resolve; notifyStarted(); });
  const sending = sendOrderReceipt(entry.id);
  await started;
  await sendOrderReceipt(entry.id);
  release(Response.json({ id: "provider-accepted-fixture" }));
  await sending;
  assert.equal(requests.length, 1);
});

test("fulfilment emails require genuine stored staff events and are sent once per stage", async () => {
  const entry = save(order({ status: "confirmed" }));
  await sendFulfilmentUpdate(entry.id, "confirmed");
  assert.equal(requests.length, 0);
  entry.fulfilmentEvents = [{ status: "confirmed", at: "2026-11-25T10:30:00.000Z", staffId: "staff-fixture" }];
  save(entry);
  await sendFulfilmentUpdate(entry.id, "out_for_delivery");
  assert.equal(requests.length, 0);
  await sendFulfilmentUpdate(entry.id, "confirmed");
  await sendFulfilmentUpdate(entry.id, "confirmed");
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.html, /Being prepared/);
  assert.equal(documents.get(`orders/${entry.id}/notifications/confirmed`).providerId, "provider-accepted-fixture");
});
