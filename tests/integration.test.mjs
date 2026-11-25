import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const project = process.env.FIREBASE_PROJECT_ID;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const baseUrl = new URL(process.env.TEST_STORE_URL || "http://127.0.0.1:3640");
const loopback = /^(127\.0\.0\.1|localhost):\d+$/;
if (!project?.startsWith("demo-") || !loopback.test(authHost ?? "") || !loopback.test(firestoreHost ?? "") || !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) {
  throw new Error("Run these integration tests against the local Firebase emulators and local Next.js server.");
}

const app = initializeApp({ projectId: project });
const auth = getAuth(app);
const db = getFirestore(app);

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

async function signIn(email, password) {
  const result = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=integration`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(result.status, 200);
  return (await result.json()).idToken;
}

test("Firestore connects the storefront, staff permissions, checkout, wholesale and tracking", { timeout: 90000 }, async (t) => {
  const suffix = randomUUID().slice(0, 8);
  const id = `test-pantry-${suffix}`;
  const staffEmail = `staff-${suffix}@imperial.test`;
  const visitorEmail = `visitor-${suffix}@imperial.test`;
  const password = randomUUID();
  const [staff, visitor] = await Promise.all([
    auth.createUser({ email: staffEmail, password }), auth.createUser({ email: visitorEmail, password }),
  ]);
  const orderIds = new Set();
  const quoteIds = new Set();
  const keys = new Set();
  t.after(async () => {
    const batch = db.batch();
    batch.delete(db.collection("products").doc(id));
    const inventory = await db.collection("inventoryEvents").where("productId", "==", id).get();
    for (const event of inventory.docs) batch.delete(event.ref);
    for (const order of orderIds) batch.delete(db.collection("orders").doc(order));
    for (const quote of quoteIds) batch.delete(db.collection("wholesaleRequests").doc(quote));
    for (const key of keys) batch.delete(db.collection("orderRequests").doc(key));
    await Promise.all([batch.commit(), auth.deleteUsers([staff.uid, visitor.uid])]);
  });

  const unauthorized = await request("/api/admin/products");
  assert.equal(unauthorized.status, 401);
  const visitorToken = await signIn(visitorEmail, password);
  assert.equal((await request("/api/admin/orders", { token: visitorToken })).status, 403);
  await auth.setCustomUserClaims(staff.uid, { admin: true });
  const token = await signIn(staffEmail, password);

  const product = {
    id, name: `Test Pantry Rice ${suffix}`, brand: "Test Pantry", origin: "Test", size: "5 kg", category: "rice",
    saleUnit: "carton", itemsPerUnit: 4, containedUnit: "bag", purchaseMode: "wholesale", checkoutApproved: true, stockVerified: true, minimumQuantity: 2,
    price: 39500, comparePrice: null, stock: 3, rank: 1000, image: "/images/tilda.webp",
    active: true, featured: false, description: "Integration-test catalog item temporarily added to the emulator.",
  };
  const create = await request("/api/admin/products", {
    method: "PUT", token, body: {
      product: {
        ...product, size: "Sample carton", saleUnit: "carton", purchaseMode: "quote",
        checkoutApproved: undefined, stockVerified: undefined, itemsPerUnit: undefined, containedUnit: undefined, demo: true,
      },
      version: null,
    },
  });
  assert.equal(create.status, 200, JSON.stringify(create.data));
  const storefront = await fetch(new URL(`/shop?q=${suffix}`, baseUrl));
  assert.equal(storefront.status, 200);
  const html = await storefront.text();
  assert.ok(html.includes(product.name));
  assert.ok(html.includes("Price on request"));
  assert.ok(!html.includes("Sample carton"));
  const getProduct = async () => {
    const result = await request("/api/admin/products", { token });
    assert.equal(result.status, 200);
    return result.data.products.find((entry) => entry.id === id);
  };
  const makeCheckout = (price, quantity = 2) => {
    const key = randomUUID();
    keys.add(key);
    return { key, items: [{ productId: id, quantity, price }], customer: { name: "Test Customer", email: "", phone: "+234 803 000 0000", address: "1 Test Avenue, Ikeja, Lagos", zone: "mainland", notes: "" } };
  };
  const place = async (body) => {
    const result = await request("/api/orders", { method: "POST", body });
    if (result.status === 201) orderIds.add(result.data.id);
    return result;
  };
  const pending = await getProduct();
  assert.equal(pending.price, product.price);
  assert.equal(pending.checkoutApproved, undefined);
  const wholesale = {
    key: randomUUID(),
    contact: { name: "Test Buyer", business: "Test Caterer", phone: "+234 803 000 0000", email: "", location: "Ikeja", state: "Lagos", preferredTiming: "Weekday morning", notes: "" },
    items: [{ productId: id, quantity: 50, unit: "carton" }],
  };
  const submitQuote = (body) => request("/api/wholesale", { method: "POST", body });
  const unavailable = await submitQuote({ ...wholesale, items: [{ ...wholesale.items[0], productId: `${id}-missing` }] });
  assert.equal(unavailable.status, 409);
  const quote = await submitQuote(wholesale);
  assert.equal(quote.status, 201, JSON.stringify(quote.data));
  quoteIds.add(quote.data.id);
  assert.deepEqual(Object.keys(quote.data), ["id"]);
  assert.deepEqual(await submitQuote(wholesale), quote);
  assert.equal((await submitQuote({ ...wholesale, contact: { ...wholesale.contact, notes: "Changed" } })).status, 409);
  assert.equal((await getProduct()).stock, 3);
  assert.equal((await request("/api/admin/wholesale")).status, 401);
  assert.equal((await request("/api/admin/wholesale", { token: visitorToken })).status, 403);
  const staffQuotes = await request("/api/admin/wholesale", { token });
  assert.equal(staffQuotes.status, 200);
  const savedQuotes = staffQuotes.data.requests.filter((entry) => entry.id === quote.data.id);
  assert.equal(savedQuotes.length, 1);
  assert.equal(savedQuotes[0].items[0].name, product.name);
  assert.equal(savedQuotes[0].items[0].quantity, 50);
  assert.equal(savedQuotes[0].items[0].productId, id);
  assert.equal(savedQuotes[0].items[0].unit, "carton");
  assert.equal(savedQuotes[0].contact.state, "Lagos");
  assert.equal(savedQuotes[0].contact.preferredTiming, "Weekday morning");
  assert.equal(savedQuotes[0].status, "new");
  const updateQuote = (status) => request("/api/admin/wholesale", { method: "PATCH", token, body: { id: quote.data.id, status } });
  assert.equal((await updateQuote("contacted")).data.request.status, "contacted");
  assert.equal((await updateQuote("accepted")).status, 409);
  const quoteData = {
    items: [{ productId: id, quantity: 50, unit: "carton", specification: "Integration test carton specification", unitPrice: 4000 }],
    delivery: 5000, validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
  const saveQuote = (data, staffToken = token) => request("/api/admin/wholesale", {
    method: "PATCH", token: staffToken, body: { id: quote.data.id, quote: data, previousQuoteAt: null },
  });
  assert.equal((await saveQuote(quoteData, visitorToken)).status, 403);
  assert.equal((await saveQuote({ ...quoteData, validUntil: "2000-01-01" })).status, 400);
  assert.equal((await saveQuote({ ...quoteData, items: [{ ...quoteData.items[0], productId: id + "-other" }] })).status, 400);
  const savedQuote = await saveQuote(quoteData);
  assert.equal(savedQuote.status, 200, JSON.stringify(savedQuote.data));
  assert.equal(savedQuote.data.request.status, "quoted");
  assert.equal(savedQuote.data.request.quote.subtotal, 200000);
  assert.equal(savedQuote.data.request.quote.total, 205000);
  assert.equal((await saveQuote(quoteData)).status, 409);
  assert.equal((await updateQuote("accepted")).data.request.status, "accepted");
  assert.equal((await updateQuote("closed")).data.request.status, "closed");
  assert.equal((await updateQuote("contacted")).status, 409);

  assert.equal((await place(makeCheckout(product.price))).status, 409);
  assert.equal((await getProduct()).stock, 3);

  const priced = await request("/api/admin/products", { method: "PUT", token, body: { product, version: pending.version } });
  assert.equal(priced.status, 200, JSON.stringify(priced.data));
  const original = await getProduct();
  assert.equal(original.price, product.price);
  assert.equal((await place(makeCheckout(product.price, 1))).status, 409);
  const differentPack = await request("/api/admin/products", {
    method: "PUT", token, body: { product: { ...product, size: "1 kg" }, version: original.version },
  });
  assert.equal(differentPack.status, 409);
  const tampered = await place(makeCheckout(1));
  assert.equal(tampered.status, 409);
  assert.equal((await getProduct()).stock, 3);

  const attempts = [makeCheckout(product.price), makeCheckout(product.price)];
  const orders = await Promise.all(attempts.map(place));
  assert.deepEqual(orders.map((result) => result.status).sort(), [201, 409], JSON.stringify(orders));
  const successIndex = orders.findIndex((result) => result.status === 201);
  const order = orders[successIndex].data;
  assert.equal(order.shipping, 0);
  assert.equal(order.total, 79000);
  const repeat = await place(attempts[successIndex]);
  assert.equal(repeat.status, 201);
  assert.equal(repeat.data.id, order.id);
  assert.equal((await getProduct()).stock, 1);
  const inventory = (await request("/api/admin/products", { token })).data.inventoryEvents.filter((event) => event.productId === id);
  assert.equal(inventory.filter((event) => event.staffId === staff.uid && event.from === null && event.to === 3).length, 1);
  assert.equal(inventory.filter((event) => event.orderId === order.id && event.from === 3 && event.to === 1).length, 1);
  const stale = await request("/api/admin/products", { method: "PUT", token, body: { product, version: original.version } });
  assert.equal(stale.status, 409);

  const staffOrders = await request("/api/admin/orders", { token });
  const storedOrder = staffOrders.data.orders.find((entry) => entry.id === order.id);
  assert.equal(storedOrder.items[0].size, "Carton of 4 × 5 kg bags");
  assert.equal(storedOrder.items[0].quantity, 2);
  const track = (phone, review, orderId = order.id) => request("/api/track", {
    method: "POST", body: { id: orderId, phone, ...(review && { review }) },
  });
  assert.equal((await track("08030000001")).status, 404);
  assert.equal((await track("08030000001", true)).status, 404);
  const tracking = await track("08030000000");
  assert.equal(tracking.status, 200);
  assert.equal(tracking.data.status, "placed");
  assert.equal("customer" in tracking.data, false);
  assert.deepEqual(tracking.data.events.map((event) => event.status), ["placed"]);
  assert.equal("reorder" in tracking.data, false);
  const review = await track("08030000000", true);
  assert.equal(review.status, 200);
  assert.equal(review.data.reorder[0].original.quantity, 2);
  assert.equal(review.data.reorder[0].current.stock, 1);
  assert.equal(review.data.reorder[0].current.price, product.price);

  const change = (status) => request("/api/admin/orders", { method: "PATCH", token, body: { id: order.id, status } });
  assert.equal((await change("delivered")).status, 409);
  const confirmed = await change("confirmed");
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.order.fulfilmentEvents.at(-1).staffId, staff.uid);
  const confirmedTracking = await track("08030000000");
  assert.equal(confirmedTracking.data.status, "confirmed");
  assert.deepEqual(confirmedTracking.data.events.map((event) => event.status), ["placed", "confirmed"]);
  assert.equal(confirmedTracking.data.events.some((event) => "staffId" in event), false);
  for (const status of ["cancelled", "cancelled"]) {
    const response = await change(status);
    assert.equal(response.status, 200, JSON.stringify(response.data));
  }
  const cancelledTracking = await track("08030000000");
  assert.equal(cancelledTracking.data.status, "cancelled");
  assert.deepEqual(cancelledTracking.data.events.map((event) => event.status), ["placed", "confirmed", "cancelled"]);
  assert.equal((await getProduct()).stock, 3);
  const released = (await request("/api/admin/products", { token })).data.inventoryEvents;
  assert.equal(released.filter((event) => event.orderId === order.id && event.staffId === staff.uid && event.from === 1 && event.to === 3).length, 1);

  const simulationId = `IP-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
  orderIds.add(simulationId);
  const originalOrder = (await db.collection("orders").doc(order.id).get()).data();
  await db.collection("orders").doc(simulationId).set({
    ...originalOrder, status: "placed", simulated: true, payment: { status: "paid" },
    fulfilmentEvents: [{ status: "placed", at: originalOrder.createdAt }],
  });
  assert.equal((await request("/api/admin/orders", { method: "PATCH", token, body: { id: simulationId, status: "confirmed" } })).status, 409);
  const simulation = await track("08030000000", false, simulationId);
  assert.equal(simulation.data.mode, "simulated");
  assert.deepEqual(simulation.data.events.map((event) => event.status), ["placed"]);
  assert.equal(simulation.data.paymentStatus, "paid");

  assert.equal((await request("/api/admin/delivery")).status, 401);
  assert.equal((await request("/api/admin/delivery", { token: visitorToken })).status, 403);
  const deliveryRef = db.collection("storeSettings").doc("delivery");
  const originalDelivery = await deliveryRef.get();
  try {
    const defaults = await request("/api/admin/delivery", { token });
    assert.equal(defaults.status, 200);
    const { configuration, version } = defaults.data;
    const minimumConfig = { ...configuration, minimumSubtotal: 90000, quoteAboveWeightGrams: undefined };
    const configure = (next, revision) => request("/api/admin/delivery", {
      method: "PUT", token, body: { configuration: next, version: revision },
    });
    const updatedDelivery = await configure(minimumConfig, version);
    assert.equal(updatedDelivery.status, 200, JSON.stringify(updatedDelivery.data));
    assert.equal((await configure(minimumConfig, version)).status, 409);
    const minimumOrder = await place(makeCheckout(product.price));
    assert.equal(minimumOrder.status, 409);
    assert.match(minimumOrder.data.error, /subtotal/);

    const quoteConfig = { ...configuration, quoteAboveWeightGrams: 100000 };
    assert.equal((await configure(quoteConfig, updatedDelivery.data.version)).status, 200);
    const requiresQuote = await place(makeCheckout(product.price));
    assert.equal(requiresQuote.status, 409);
    assert.match(requiresQuote.data.error, /requires a delivery quote/);
    assert.equal((await getProduct()).stock, 3);
  } finally {
    if (originalDelivery.exists) await deliveryRef.set(originalDelivery.data());
    else await deliveryRef.delete();
  }

  await db.collection("products").doc(id).update({ price: product.price + 500 });
  assert.equal((await track("08030000000", true)).data.reorder[0].current.price, product.price + 500);
  await db.collection("products").doc(id).update({ active: false });
  assert.equal((await track("08030000000", true)).data.reorder[0].current, null);

  // Wait for pending client sockets to drain before emulator teardown.
  await delay(20);
});

test("staff can save catalogue drafts and approve exact packs in one atomic batch", { timeout: 90000 }, async (t) => {
  const suffix = randomUUID().slice(0, 8);
  const password = randomUUID();
  const ids = [`catalogue-carton-${suffix}`, `catalogue-bag-${suffix}`];
  const [staff, visitor] = await Promise.all([
    auth.createUser({ email: `catalogue-staff-${suffix}@imperial.test`, password }),
    auth.createUser({ email: `catalogue-visitor-${suffix}@imperial.test`, password }),
  ]);
  const refs = ids.map((id) => db.collection("products").doc(id));
  t.after(async () => {
    const batch = db.batch();
    for (const ref of refs) batch.delete(ref);
    const inventory = await db.collection("inventoryEvents").where("productId", "in", ids).get();
    for (const event of inventory.docs) batch.delete(event.ref);
    await Promise.all([batch.commit(), auth.deleteUsers([staff.uid, visitor.uid])]);
  });
  await auth.setCustomUserClaims(staff.uid, { admin: true });
  const [token, visitorToken] = await Promise.all([signIn(staff.email, password), signIn(visitor.email, password)]);
  const update = (updates, staffToken = token) => request("/api/admin/catalogue", {
    method: "PATCH", token: staffToken, body: { updates },
  });
  assert.equal((await request("/api/admin/catalogue")).status, 401);
  assert.equal((await request("/api/admin/catalogue", { token: visitorToken })).status, 403);
  assert.equal((await update([], null)).status, 401);
  assert.equal((await update([], visitorToken)).status, 403);

  const description = "Existing product notes that a catalogue update must keep.";
  await Promise.all(refs.map((ref, index) => ref.create({
    id: ref.id, name: `Catalogue fixture ${suffix} ${index}`, brand: "Test Pantry", category: "rice", origin: "",
    size: "Sample carton", saleUnit: "carton", purchaseMode: "quote", price: 99999, comparePrice: null,
    stock: 7, demo: true, rank: 9999, image: "/images/tilda.webp", active: true, featured: false, description,
  })));
  const initial = await request("/api/admin/catalogue", { token });
  assert.equal(initial.status, 200);
  const rows = ids.map((id) => ({
    id, version: initial.data.products.find((entry) => entry.id === id).version,
    saleUnit: null, size: "", itemsPerUnit: null, containedUnit: null, totalSize: "", stock: null,
    price: null, purchaseMode: "quote", checkoutApproved: false,
  }));
  const [carton, bag] = rows;
  const draft = await update([{ ...carton, price: 48000 }]);
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  const savedDraft = draft.data.products[0];
  assert.notEqual(savedDraft.version, carton.version);
  assert.equal(savedDraft.price, 48000);
  assert.equal(Boolean(savedDraft.stockVerified), false);
  assert.equal(Boolean(savedDraft.checkoutApproved), false);
  const draftPage = await fetch(new URL(`/products/${carton.id}`, baseUrl));
  assert.equal(draftPage.status, 200);
  assert.match(await draftPage.text(), /Price on request/);

  const confirmedCarton = {
    ...carton, version: savedDraft.version, saleUnit: "carton", size: "5 kg", itemsPerUnit: 4, containedUnit: "bag",
    totalSize: "20 kg", stock: 2, price: 48000, purchaseMode: "both", checkoutApproved: true,
  };
  const confirmedBag = {
    ...bag, saleUnit: "bag", size: "5 kg", stock: 0, price: 12500, purchaseMode: "retail", checkoutApproved: true,
  };
  assert.equal((await update([{ ...confirmedCarton, stock: null }])).status, 400);
  assert.equal((await update([{ ...confirmedCarton, itemsPerUnit: null }])).status, 400);
  assert.equal((await update([confirmedBag, { ...confirmedCarton, version: carton.version }])).status, 409);
  assert.equal((await refs[1].get()).get("price"), 99999);
  assert.equal((await db.collection("inventoryEvents").where("productId", "in", ids).get()).size, 0);

  const saved = await update([confirmedCarton, confirmedBag]);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const savedCarton = saved.data.products.find((entry) => entry.id === carton.id);
  const savedBag = saved.data.products.find((entry) => entry.id === bag.id);
  assert.notEqual(savedCarton.version, savedDraft.version);
  assert.equal(savedCarton.checkoutApproved, true);
  assert.equal(savedCarton.description, description);
  assert.equal(savedCarton.itemsPerUnit, 4);
  assert.equal(savedCarton.stock, 2);
  assert.equal(savedBag.stockVerified, true);
  assert.equal(savedBag.stock, 0);
  const storedCarton = await refs[0].get();
  assert.equal(storedCarton.get("price"), 48000);
  assert.equal(storedCarton.get("totalSize"), "20 kg");
  assert.equal(storedCarton.get("demo"), undefined);
  const events = await db.collection("inventoryEvents").where("productId", "in", ids).get();
  assert.equal(events.size, 2);
  for (const event of events.docs) {
    const data = event.data();
    assert.equal(data.staffId, staff.uid);
    assert.equal(data.from, null);
    assert.equal(data.to, data.productId === carton.id ? 2 : 0);
    assert.equal(data.unit, data.productId === carton.id ? "carton" : "bag");
  }
  assert.equal((await update([{ ...confirmedCarton, version: savedCarton.version, itemsPerUnit: 6 }])).status, 409);
  assert.equal((await refs[0].get()).get("itemsPerUnit"), 4);
});

test("catalogue share links only collect suggestions for staff review", { timeout: 90000 }, async (t) => {
  const suffix = randomUUID().slice(0, 8);
  const password = randomUUID();
  const ids = [`shared-carton-${suffix}`, `shared-locked-${suffix}`, `shared-hidden-${suffix}`];
  const productRefs = ids.map((id) => db.collection("products").doc(id));
  const suggestionRefs = ids.map((id) => db.collection("catalogueSuggestions").doc(id));
  const inviteRef = db.collection("catalogueInvites").doc("active");
  const originalInvite = await inviteRef.get();
  const [staff, visitor] = await Promise.all([
    auth.createUser({ email: `shared-staff-${suffix}@imperial.test`, password }),
    auth.createUser({ email: `shared-visitor-${suffix}@imperial.test`, password }),
  ]);
  t.after(async () => {
    const batch = db.batch();
    for (const ref of [...productRefs, ...suggestionRefs]) batch.delete(ref);
    const inventory = await db.collection("inventoryEvents").where("productId", "in", ids).get();
    for (const event of inventory.docs) batch.delete(event.ref);
    if (originalInvite.exists) batch.set(inviteRef, originalInvite.data());
    else batch.delete(inviteRef);
    await Promise.all([batch.commit(), auth.deleteUsers([staff.uid, visitor.uid])]);
  });
  await auth.setCustomUserClaims(staff.uid, { admin: true });
  const [staffToken, visitorToken] = await Promise.all([signIn(staff.email, password), signIn(visitor.email, password)]);
  const [cartonRef, lockedRef, hiddenRef] = productRefs;
  const template = {
    name: `Shared catalogue rice ${suffix}`, brand: "Test Pantry", category: "rice", origin: "",
    saleUnit: "carton", size: "Sample carton", purchaseMode: "quote", price: 99999, comparePrice: null,
    stock: 7, rank: 9999, image: "/images/tilda.webp", active: true, featured: false,
    description: "Details only visible in the full product and staff editors.",
  };
  await Promise.all([
    cartonRef.create({ ...template, id: cartonRef.id, demo: true }),
    lockedRef.create({
      ...template, id: lockedRef.id, saleUnit: "bag", size: "5 kg", price: 12000, stock: 14,
      stockVerified: true, checkoutApproved: true, purchaseMode: "retail",
    }),
    hiddenRef.create({ ...template, id: hiddenRef.id, active: false }),
  ]);

  const manage = (method, token = staffToken, data) => request("/api/admin/catalogue/invite", { method, token, body: data });
  const recipient = (method, token, updates) => request("/api/catalogue-update", { method, token, body: updates ? { updates } : undefined });
  assert.equal((await manage("POST", null)).status, 401);
  assert.equal((await manage("POST", visitorToken)).status, 403);
  assert.equal((await recipient("GET")).status, 403);

  const firstInvite = await manage("POST");
  assert.equal(firstInvite.status, 201, JSON.stringify(firstInvite.data));
  const { token } = firstInvite.data;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(firstInvite.data.invite.status, "active");
  assert.ok(Date.parse(firstInvite.data.invite.expiresAt) > Date.now());
  assert.equal(JSON.stringify((await inviteRef.get()).data()).includes(token), false);
  assert.equal(JSON.stringify((await manage("GET")).data).includes(token), false);
  assert.equal((await manage("GET", token)).status, 401);
  assert.equal((await request("/api/admin/catalogue", { token })).status, 401);

  const shared = await recipient("GET", token);
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  const carton = shared.data.products.find((product) => product.id === cartonRef.id);
  const locked = shared.data.products.find((product) => product.id === lockedRef.id);
  assert.equal(carton.price, null);
  assert.equal(carton.stock, null);
  assert.equal(carton.size, "");
  assert.equal(carton.image, template.image);
  assert.equal(carton.packLocked, false);
  assert.equal(locked.price, null);
  assert.equal(locked.stock, null);
  assert.equal(locked.packLocked, true);
  assert.equal(shared.data.products.some((product) => product.id === hiddenRef.id), false);
  for (const product of [carton, locked]) {
    for (const field of ["purchaseMode", "checkoutApproved", "stockSpecification", "description", "demo"]) {
      assert.equal(Object.hasOwn(product, field), false, field);
    }
  }

  const update = {
    id: carton.id, version: carton.version, suggestionVersion: null,
    saleUnit: "carton", size: "5 kg", itemsPerUnit: 4, containedUnit: "bag", totalSize: "20 kg", price: 48000, stock: 0,
  };
  const lockedUpdate = {
    ...update, id: locked.id, version: locked.version, saleUnit: "bag", size: "10 kg",
    itemsPerUnit: null, containedUnit: null, totalSize: "",
  };
  assert.equal((await recipient("PATCH", token, [{ ...update, checkoutApproved: true }])).status, 400);
  assert.equal((await recipient("PATCH", token, [update, lockedUpdate])).status, 409);
  assert.equal((await recipient("PATCH", token, [{ ...update, id: hiddenRef.id }])).status, 409);
  assert.equal((await suggestionRefs[0].get()).exists, false);

  const suggestion = await recipient("PATCH", token, [update]);
  assert.equal(suggestion.status, 200, JSON.stringify(suggestion.data));
  const saved = suggestion.data.products.find((product) => product.id === carton.id);
  assert.ok(saved.suggestionVersion);
  assert.equal(saved.stock, 0);
  assert.equal((await recipient("PATCH", token, [update])).status, 409);
  const storedSuggestion = await suggestionRefs[0].get();
  assert.equal(storedSuggestion.get("price"), update.price);
  assert.equal((await cartonRef.get()).get("price"), template.price);
  assert.equal((await cartonRef.get()).get("stock"), template.stock);
  assert.equal((await db.collection("inventoryEvents").where("productId", "in", ids).get()).size, 0);
  const storefront = await fetch(new URL(`/products/${carton.id}`, baseUrl));
  assert.equal(storefront.status, 200);
  assert.match(await storefront.text(), /Price on request/);

  const staffList = await manage("GET");
  assert.equal(staffList.status, 200);
  const pending = staffList.data.suggestions.find((product) => product.id === carton.id);
  assert.equal(pending.suggestionVersion, saved.suggestionVersion);
  assert.equal(pending.itemsPerUnit, 4);
  assert.equal(pending.stock, 0);

  const lockedSuggestion = await recipient("PATCH", token, [{ ...lockedUpdate, size: "5 kg", stock: null }]);
  assert.equal(lockedSuggestion.status, 200);
  const lockedPending = lockedSuggestion.data.products[0];
  const dismiss = { dismiss: [{ id: locked.id, suggestionVersion: lockedPending.suggestionVersion }] };
  assert.equal((await manage("PATCH", token, dismiss)).status, 401);
  assert.equal((await manage("PATCH", staffToken, dismiss)).data.dismissed, 1);
  assert.equal((await suggestionRefs[1].get()).exists, false);
  assert.equal((await lockedRef.get()).get("price"), 12000);
  assert.equal((await lockedRef.get()).get("stock"), 14);

  const replace = await manage("POST");
  assert.equal(replace.status, 201);
  assert.equal((await recipient("GET", token)).status, 403);
  assert.equal((await recipient("GET", replace.data.token)).status, 200);
  await inviteRef.update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await recipient("GET", replace.data.token)).status, 403);
  assert.equal((await recipient("PATCH", replace.data.token, [update])).status, 403);
  assert.equal((await manage("GET")).data.invite.status, "expired");

  const finalInvite = await manage("POST");
  assert.equal(finalInvite.status, 201);
  assert.equal((await manage("DELETE")).data.invite.status, "revoked");
  assert.equal((await recipient("GET", finalInvite.data.token)).status, 403);
  assert.equal((await recipient("PATCH", finalInvite.data.token, [update])).status, 403);
  assert.equal((await suggestionRefs[0].get()).exists, true);

  const approve = {
    ...update, suggestionVersion: pending.suggestionVersion, checkoutApproved: true, purchaseMode: "both",
  };
  const accept = await request("/api/admin/catalogue", { method: "PATCH", token: staffToken, body: { updates: [approve] } });
  assert.equal(accept.status, 200, JSON.stringify(accept.data));
  assert.equal((await cartonRef.get()).get("price"), 48000);
  assert.equal((await cartonRef.get()).get("stock"), 0);
  assert.equal((await cartonRef.get()).get("checkoutApproved"), true);
  assert.equal((await suggestionRefs[0].get()).exists, false);
});
