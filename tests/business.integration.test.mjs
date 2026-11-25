import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const project = process.env.FIREBASE_PROJECT_ID;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const base = new URL(process.env.TEST_STORE_URL || "http://127.0.0.1:3640");
const loopback = /^(127\.0\.0\.1|localhost):\d+$/;
if (!project?.startsWith("demo-") || !loopback.test(authHost ?? "") || !loopback.test(firestoreHost ?? "") || !["127.0.0.1", "localhost"].includes(base.hostname)) {
  throw new Error("Use both Firebase emulators and the local storefront for these tests.");
}

const app = initializeApp({ projectId: project });
const auth = getAuth(app);
const db = getFirestore(app);
const settings = db.collection("storeSettings").doc("publicBusiness");

async function api(token, change) {
  const response = await fetch(new URL("/api/admin/business", base), {
    method: change ? "PUT" : "GET",
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(change && { "Content-Type": "application/json" }) },
    body: change ? JSON.stringify(change) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function signIn(email, password) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=integration`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).idToken;
}

async function page(path) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  return response.text();
}

test("authorised staff control public details, review permission and private support cases", { timeout: 90000 }, async (t) => {
  const suffix = randomUUID().slice(0, 8);
  const password = randomUUID();
  const staff = await auth.createUser({ email: `staff-business-${suffix}@imperial.test`, password });
  const visitor = await auth.createUser({ email: `visitor-business-${suffix}@imperial.test`, password });
  const original = await settings.get();
  const reviewId = randomUUID();
  const caseId = randomUUID();
  const productId = `review-test-${suffix}`;
  const productPath = `/products/${productId}`;
  const item = db.collection("products").doc(productId);
  let savedVersion;
  t.after(async () => {
    const batch = db.batch();
    batch.delete(db.collection("customerReviews").doc(reviewId));
    batch.delete(db.collection("supportCases").doc(caseId));
    batch.delete(item);
    await Promise.all([batch.commit(), auth.deleteUsers([staff.uid, visitor.uid])]);
    if (savedVersion) await db.runTransaction(async (transaction) => {
      const current = await transaction.get(settings);
      const timestamp = current.updateTime;
      if (!timestamp || `${timestamp.seconds}:${timestamp.nanoseconds}` !== savedVersion) return;
      if (original.exists) transaction.set(settings, original.data());
      else transaction.delete(settings);
    });
  });

  assert.equal((await api()).status, 401);
  assert.equal((await api(await signIn(visitor.email, password))).status, 403);
  await auth.setCustomUserClaims(staff.uid, { admin: true });
  const token = await signIn(staff.email, password);
  const existing = await api(token);
  assert.equal(existing.status, 200);
  const tradingName = `Business test ${suffix}`;
  const saved = await api(token, {
    kind: "business",
    value: { ...existing.body.business, tradingName, privacyEmail: `privacy-${suffix}@imperial.test` },
    version: existing.body.version,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  savedVersion = saved.body.version;
  assert.ok((await page("/contact")).includes(tradingName));
  assert.ok((await page("/privacy")).includes(`mailto:privacy-${suffix}@imperial.test`));
  assert.equal((await api(token, { kind: "business", value: saved.body.business, version: existing.body.version })).status, 409);

  await item.create({
    id: productId, name: "Review test product", brand: "Emulator", category: "rice", origin: "", size: "",
    price: null, stock: 0, comparePrice: null, rank: 9999, image: "/images/tilda.webp",
    description: "Disposable review fixture product in the local emulator.", active: true, featured: false,
  });
  const review = {
    id: reviewId, productId, text: `Disposable review fixture ${suffix}`, rating: null, date: "2024-01-01", status: "pending",
  };
  assert.equal((await api(token, { kind: "review", value: review })).status, 200);
  assert.ok(!(await page(productPath)).includes(review.text));
  const approval = { ...review, status: "approved" };
  assert.equal((await api(token, { kind: "review", value: approval })).status, 400);
  const namedApproval = { ...approval, publishPermission: true, displayName: `Review name ${suffix}` };
  assert.equal((await api(token, { kind: "review", value: namedApproval })).status, 400);
  assert.equal((await api(token, { kind: "review", value: { ...approval, publishPermission: true } })).status, 200);
  assert.ok((await page(productPath)).includes(review.text));
  assert.equal((await api(token, { kind: "review", value: { ...approval, status: "hidden" } })).status, 200);
  assert.ok(!(await page(productPath)).includes(review.text));

  const support = { id: caseId, reference: `Case ${suffix}`, summary: `Private support fixture ${suffix}`, status: "open" };
  assert.equal((await api(token, { kind: "support", value: support })).status, 200);
  assert.equal((await api(token, { kind: "support", value: { ...support, status: "resolved" } })).status, 200);
  const dashboard = await api(token);
  assert.equal(dashboard.status, 200);
  const cases = dashboard.body.supportCases.filter((entry) => entry.id === caseId);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].status, "resolved");
  assert.ok(!(await page("/contact")).includes(support.summary));
});
