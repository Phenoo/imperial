import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";
import { catalogueFallback } from "../lib/catalogue-fallback.ts";
import { canCheckoutProduct, productAvailability } from "../lib/commerce.ts";

const entries = new Map();
const configurations = [];
globalThis[Symbol.for("imperial.public.cache.test")] = {
  unstable_cache(load, key, options) {
    configurations.push({ key, options });
    const cacheKey = JSON.stringify(key);
    return async () => {
      if (!entries.has(cacheKey)) entries.set(cacheKey, await load());
      return entries.get(cacheKey);
    };
  },
  revalidateTag(tag, profile) {
    assert.deepEqual(profile, { expire: 0 });
    entries.delete(JSON.stringify([tag]));
  },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next("next/dist/compiled/server-only/empty.js", context);
  if (specifier === "next/cache") return next("data:text/javascript,const cache=globalThis[Symbol.for('imperial.public.cache.test')];export const unstable_cache=cache.unstable_cache;export const revalidateTag=cache.revalidateTag;", context);
  return next(specifier, context);
} });
const { cachedPublicStoreRead, invalidatePublicStore, publicReadDeadline } = await import("../lib/public-store-cache.ts");

beforeEach(() => {
  entries.clear(); configurations.length = 0;
  process.env.FIREBASE_PROJECT_ID = "isolated-public-cache-test";
  delete process.env.FIRESTORE_EMULATOR_HOST;
});
after(() => { delete globalThis[Symbol.for("imperial.public.cache.test")]; });

test("a shared public snapshot avoids repeat reads and staff invalidation refreshes it", async () => {
  let reads = 0;
  const read = cachedPublicStoreRead("catalogue", async () => ({ version: ++reads }), () => ({ version: 0 }));
  assert.deepEqual(await read(), { version: 1 });
  assert.deepEqual(await read(), { version: 1 });
  assert.equal(configurations[0].options.revalidate, 300);
  invalidatePublicStore("catalogue");
  assert.deepEqual(await read(), { version: 2 });
  assert.equal(reads, 2);
});

test("quota errors cache a safe fallback instead of hammering Firestore on every page", async () => {
  let reads = 0;
  const read = cachedPublicStoreRead("catalogue", async () => { reads++; throw new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."); },
    () => ({ products: catalogueFallback(), available: false }));
  const result = await read();
  assert.equal(result.available, false);
  assert.equal(result.products.length, 86);
  assert.deepEqual(await read(), result);
  assert.equal(reads, 1);
});

test("fallback products keep real catalogue images but never publish sample prices or stock claims", () => {
  const products = catalogueFallback();
  assert.equal(new Set(products.map(({ id }) => id)).size, products.length);
  assert.ok(products.every((product) => product.image.startsWith("/images/")));
  assert.ok(products.every((product) => !canCheckoutProduct(product) && productAvailability(product) === "quote"));
  assert.ok(products.every((product) => product.price === null && product.quotePrice === undefined && !product.stockVerified));
});

test("emulator reads stay fresh and never invalidate the production cache", async () => {
  process.env.FIREBASE_PROJECT_ID = "demo-imperial-pantry";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8685";
  let reads = 0;
  const read = cachedPublicStoreRead("delivery", async () => ++reads, () => 0);
  assert.equal(await read(), 1);
  assert.equal(await read(), 2);
  invalidatePublicStore("delivery");
  assert.equal(entries.size, 0);
});

test("public reads have a deadline while healthy reads preserve their result", async () => {
  assert.equal(await publicReadDeadline(Promise.resolve("ready"), 50), "ready");
  await assert.rejects(publicReadDeadline(new Promise(() => {}), 5), /timed out/);
});
