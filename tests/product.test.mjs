import assert from "node:assert/strict";
import { test } from "node:test";
import { canCheckoutProduct, listedPrice, packLabel, productAvailability, productLimit, publicProduct } from "../lib/commerce.ts";
import { starterCatalog } from "../lib/catalog.ts";
import { demoCatalog } from "../lib/demo-catalog.ts";

const tilda = starterCatalog.find((product) => product.id === "tilda-pure-basmati");

test("candidate prices and legacy carton placeholders remain quote-only even in demo catalogue", () => {
  const indiaGate = starterCatalog.find((product) => product.id === "india-gate-feast-rozzana");
  const oldRecord = { ...indiaGate, saleUnit: "carton", size: "Sample carton", price: 60000, stock: 5, demo: true };
  const publicRecord = publicProduct(oldRecord);
  assert.equal(publicRecord.id, indiaGate.id);
  assert.equal(publicRecord.price, null);
  assert.equal(productAvailability(publicRecord), "quote");
  assert.equal(packLabel(publicRecord), "Carton details on request");
  assert.equal(productLimit(publicRecord), 0);
  assert.ok(demoCatalog().every((product) => publicProduct(product).price === null));
});

test("only explicitly verified prices, stock and exact selling units permit checkout", () => {
  const verified = {
    ...tilda, demo: undefined, checkoutApproved: true, stockVerified: true,
    saleUnit: "carton", itemsPerUnit: 4, containedUnit: "bag", totalSize: "20 kg",
    purchaseMode: "wholesale", minimumQuantity: 2, stock: 3,
  };
  assert.equal(packLabel(verified), "Carton of 4 × 5 kg bags · 20 kg total");
  assert.equal(productLimit(verified), 3);
  assert.equal(productAvailability(verified), "in-stock");
  assert.equal(productAvailability({ ...verified, stock: 1 }), "out-of-stock");
  assert.equal(canCheckoutProduct({ ...verified, itemsPerUnit: undefined }), false);
  assert.equal(canCheckoutProduct({ ...verified, stockVerified: undefined }), false);
  assert.equal(canCheckoutProduct({ ...verified, purchaseMode: "quote" }), false);
  assert.equal(canCheckoutProduct({ ...verified, size: "0 kg" }), false);
  assert.equal(packLabel({ ...tilda, saleUnit: "bag" }), "1 × 5 kg bag");
});

test("published quote prices retain the quote route and hide unpublished or demo amounts", () => {
  const quote = {
    ...tilda, demo: undefined, checkoutApproved: undefined, saleUnit: "carton", size: "",
    purchaseMode: "quote", price: 65000, pricePublished: true, stock: 4,
  };
  const visible = publicProduct(quote);
  assert.equal(visible.price, null);
  assert.equal(visible.comparePrice, null);
  assert.equal(visible.quotePrice, 65000);
  assert.equal(listedPrice(visible), 65000);
  assert.equal(productAvailability(visible), "quote");
  assert.equal(canCheckoutProduct(visible), false);
  assert.equal(productLimit(visible), 0);
  assert.equal(publicProduct(visible).quotePrice, 65000);
  assert.equal(publicProduct({ ...quote, pricePublished: undefined, quotePrice: 999 }).quotePrice, undefined);
  assert.equal(publicProduct({ ...quote, demo: true, quotePrice: 999 }).quotePrice, undefined);
});

test("known size variants and hamper contents retain independent catalogue identities", () => {
  const royalPalace = starterCatalog.filter((product) => product.variantGroup === "royal-palace-basmati");
  assert.deepEqual(royalPalace.map(({ id }) => id), ["royal-palace-basmati-1kg", "royal-palace-basmati-5kg"]);
  assert.deepEqual(royalPalace.map(packLabel), ["1 × 1 kg bag", "1 × 5 kg bag"]);
  const hampers = starterCatalog.filter((product) => product.category === "hampers");
  assert.ok(hampers.length > 0 && hampers.every((product) => product.bundleContents.length > 1));
});
