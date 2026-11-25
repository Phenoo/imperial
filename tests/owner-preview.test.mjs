import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { starterCatalog } from "../lib/catalog.ts";
import { ownerPreviewCatalog } from "../lib/demo-catalog.ts";
import { basketProductLimit, canCheckoutProduct, isPreviewProduct, MAX_PER_ITEM, productLimit, productSpecification, publicProduct } from "../lib/commerce.ts";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next("next/dist/compiled/server-only/empty.js", context);
  if (context.parentURL?.endsWith(".ts") && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context);
  return next(specifier, context);
} });
const { isOwnerPreview } = await import("../lib/store-settings.ts");

test("all 86 owner-review products have varied, stable naira prices without changing the source catalogue", () => {
  const original = structuredClone(starterCatalog);
  const products = ownerPreviewCatalog();
  assert.equal(products.length, 86);
  assert.ok(products.every(({ price }) => Number.isInteger(price) && price > 0));
  assert.ok(new Set(products.map(({ price }) => price)).size > 40);
  assert.deepEqual(products, ownerPreviewCatalog());
  assert.deepEqual(starterCatalog, original);
});

test("owner-review prices never invent pack contents, images or confirmed stock", () => {
  for (const product of ownerPreviewCatalog()) {
    const original = starterCatalog.find(({ id }) => id === product.id);
    assert.ok(original);
    assert.equal(product.image, original.image);
    assert.equal(productSpecification(product), productSpecification(original));
    assert.equal(product.stockVerified, undefined);
    assert.equal(product.checkoutApproved, undefined);
    assert.equal(product.comparePrice, null);
  }
});

test("preview products support a presentation basket but never pass server checkout approval", () => {
  for (const product of ownerPreviewCatalog()) {
    assert.equal(isPreviewProduct(product), true);
    assert.equal(basketProductLimit(product), MAX_PER_ITEM);
    assert.equal(productLimit(product), 0);
    assert.equal(canCheckoutProduct(product), false);
    assert.equal(publicProduct(product).price, null);
  }
});

test("approved stock and pricing retain their original basket and checkout limits", () => {
  const original = starterCatalog.find(({ id }) => id === "tilda-pure-basmati");
  const approved = { ...original, demo: undefined, price: 30000, stock: 3, stockVerified: true, checkoutApproved: true, purchaseMode: "retail" };
  assert.equal(isPreviewProduct(approved), false);
  assert.equal(canCheckoutProduct(approved), true);
  assert.equal(basketProductLimit(approved), 3);
  assert.equal(productLimit(approved), 3);
});

test("owner review can be switched off independently and cannot run with live store mode", () => {
  const oldDemo = process.env.STORE_DEMO_CATALOG;
  const oldPreview = process.env.STORE_OWNER_PREVIEW;
  try {
    process.env.STORE_DEMO_CATALOG = "1";
    delete process.env.STORE_OWNER_PREVIEW;
    assert.equal(isOwnerPreview(), true);
    process.env.STORE_OWNER_PREVIEW = "0";
    assert.equal(isOwnerPreview(), false);
    process.env.STORE_OWNER_PREVIEW = "1";
    assert.equal(isOwnerPreview(), true);
    process.env.STORE_DEMO_CATALOG = "0";
    assert.equal(isOwnerPreview(), false);
  } finally {
    if (oldDemo === undefined) delete process.env.STORE_DEMO_CATALOG;
    else process.env.STORE_DEMO_CATALOG = oldDemo;
    if (oldPreview === undefined) delete process.env.STORE_OWNER_PREVIEW;
    else process.env.STORE_OWNER_PREVIEW = oldPreview;
  }
});
