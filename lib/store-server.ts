import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { ZodError, type z } from "zod";
import { knownProductDetails, starterCatalog } from "./catalog";
import { catalogueSuggestionsCollection } from "./catalogue-invite";
import { catalogueFallback } from "./catalogue-fallback";
import { canCheckoutProduct, isMultiUnit, naira, nextStatuses, packLabel, productSpecification, publicProduct, sellingUnitLabel, type OnlinePayment, type PaymentProvider, type Order, type OrderStatus, type OrderSummary, type Product } from "./commerce";
import { estimateDelivery } from "./delivery-estimate";
import { getDeliverySettings } from "./delivery-server";
import { demoCatalog } from "./demo-catalog";
import { database, firebaseProjectId } from "./firebase-server";
import { orderOperationsMode, reliableFulfilment, type TrackingResult } from "./order-operations";
import { bulkPricingSchema, checkoutSchema, productSchema, type CatalogueUpdate } from "./validation";
import { isDemoStore } from "./store-settings";
import { cachedPublicStoreRead } from "./public-store-cache";

export class StoreError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

type Checkout = z.output<typeof checkoutSchema>;
export type ProductRecord = Product & { version: string };
export type InventoryEvent = {
  id: string;
  productId: string;
  name: string;
  unit: string;
  from: number | null;
  to: number | null;
  at: string;
  staffId?: string;
  orderId?: string;
  simulated?: boolean;
};

function recordInventory(
  transaction: FirebaseFirestore.Transaction, product: Product, from: number | null, to: number | null,
  at: string, source: { staffId: string; orderId?: string; simulated?: boolean } | { orderId: string; simulated: boolean },
) {
  if (from === to) return;
  const ref = database().collection("inventoryEvents").doc();
  const event: InventoryEvent = {
    id: ref.id, productId: product.id, name: product.name, unit: sellingUnitLabel(product.saleUnit),
    from, to, at, ...source,
  };
  transaction.create(ref, event);
}

function readProduct(snapshot: DocumentSnapshot): Product {
  return knownProductDetails(productSchema.parse({ ...snapshot.data(), id: snapshot.id }));
}

function version(snapshot: DocumentSnapshot) {
  return `${snapshot.updateTime?.seconds}:${snapshot.updateTime?.nanoseconds}`;
}

function readOrder(snapshot: DocumentSnapshot): Order {
  return { ...snapshot.data(), id: snapshot.id } as Order;
}

type Storefront = { products: Product[]; available: boolean; catalogFailed: boolean };
const readPublicCatalogue = cachedPublicStoreRead<Storefront>("catalogue", async () => {
  const results = await database().collection("products").where("active", "==", true).get();
  const products = results.docs.map(readProduct).map(publicProduct).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return { products, available: true, catalogFailed: false };
}, () => ({ products: catalogueFallback(), available: false, catalogFailed: true }));

export const getStorefront = cache(async (): Promise<Storefront> => {
  if (!firebaseProjectId()) return { products: (isDemoStore() ? demoCatalog() : starterCatalog).map(publicProduct), available: false, catalogFailed: false };
  return readPublicCatalogue();
});

export function toSummary(order: Order): OrderSummary {
  const { id, status, subtotal, shipping, total, createdAt, updatedAt, simulated } = order;
  return { id, status, subtotal, shipping, total, createdAt, updatedAt, ...(simulated !== undefined && { simulated }), ...(order.payment && { paymentStatus: order.payment.status }) };
}

async function persistOrder({ items, customer, key }: Checkout, online: boolean, gateway?: { provider: PaymentProvider; simulated: boolean }) {
  const db = database();
  const reference = db.collection("orders").doc(`IP-${randomBytes(12).toString("hex").toUpperCase()}`);
  const retry = db.collection("orderRequests").doc(key);
  const digest = createHash("sha256").update(JSON.stringify({ items, customer, ...(online && { payment: gateway?.provider ?? "bachs" }) })).digest("hex");

  return db.runTransaction(async (transaction) => {
    const previous = await transaction.get(retry);
    if (previous.exists) {
      const data = previous.data();
      if (data?.digest !== digest) throw new StoreError("This checkout has already been submitted. Refresh and try again.", 409);
      const saved = await transaction.get(db.collection("orders").doc(data.orderId));
      if (!saved.exists) throw new StoreError("We couldn’t recover this order. Please try again later.", 503);
      return readOrder(saved);
    }

    const snapshots = await transaction.getAll(...items.map((item) => db.collection("products").doc(item.productId)));
    const lines = items.map((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) throw new StoreError("A product in your basket is no longer available. Review your basket and try again.", 409);
      const product = readProduct(snapshot);
      if (product.price === null || !canCheckoutProduct(product)) throw new StoreError(`${product.name} requires a quote. Review your basket and try again.`, 409);
      if (!product.active || product.stock < item.quantity) {
        throw new StoreError(`There isn’t enough stock for ${product.name}. Review your basket and try again.`, 409);
      }
      const minimum = product.minimumQuantity ?? 1;
      if (item.quantity < minimum) throw new StoreError(`Order at least ${minimum} ${sellingUnitLabel(product.saleUnit, minimum)} of ${product.name}.`, 409);
      if (product.price !== item.price) throw new StoreError(`The price of ${product.name} changed. Review your basket and try again.`, 409);
      return { productId: product.id, name: product.name, size: packLabel(product), price: product.price, quantity: item.quantity, product };
    });

    const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const delivery = estimateDelivery(customer.zone, subtotal, await getDeliverySettings(transaction), lines);
    if (delivery.kind === "minimum") throw new StoreError(`Lagos delivery is available from a subtotal of ${naira(delivery.minimum)}.`, 409);
    if (delivery.kind !== "priced") throw new StoreError("This basket requires a delivery quote. Review your delivery options before checking out.", 409);
    const shipping = delivery.fee;
    const now = new Date().toISOString();
    const simulated = isDemoStore() || (online && (gateway?.simulated ?? process.env.BACHS_API_KEY?.trim().startsWith("sk_sandbox_") === true));
    const order: Order = {
      id: reference.id, items: lines.map(({ product, ...item }, index) => {
        const remaining = product.stock - item.quantity;
        transaction.update(snapshots[index].ref, { stock: remaining });
        recordInventory(transaction, product, product.stock, remaining, now, { orderId: reference.id, simulated });
        return item;
      }),
      customer, subtotal, shipping, total: subtotal + shipping, status: "placed", createdAt: now, updatedAt: now,
      fulfilmentEvents: [{ status: "placed", at: now }],
      simulated,
      ...(online && { payment: { status: "pending", provider: gateway?.provider ?? "bachs", ...(gateway?.provider === "paystack" && { checkoutId: reference.id }), expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() } }),
    };
    transaction.create(reference, order);
    transaction.create(retry, { digest, orderId: reference.id });
    return order;
  });
}

export async function placeOrder(checkout: Checkout) {
  return toSummary(await persistOrder(checkout, false));
}

export function reserveOnlineOrder(checkout: Checkout, gateway?: { provider: PaymentProvider; simulated: boolean }) {
  return persistOrder(checkout, true, gateway);
}

export async function findOnlineOrder(id: string) {
  const snapshot = await database().collection("orders").doc(id).get();
  if (!snapshot.exists) return null;
  const order = readOrder(snapshot);
  return order.payment ? order : null;
}

export async function attachOnlineCheckout(id: string, checkoutId: string, checkoutUrl: string, expiresAt: string) {
  return database().runTransaction(async (transaction) => {
    const reference = database().collection("orders").doc(id);
    const snapshot = await transaction.get(reference);
    const order = readOrder(snapshot);
    if (order.payment?.status !== "pending") throw new StoreError("That payment window closed. Please start a new checkout.", 409);
    if (order.payment.checkoutId && order.payment.checkoutId !== checkoutId) throw new StoreError("This order already has a checkout session.", 409);
    transaction.update(reference, { payment: { ...order.payment, status: "pending", checkoutId, checkoutUrl, expiresAt } });
  });
}

export async function applyOnlinePayment(id: string, checkoutId: string | undefined, status: "paid" | "expired" | "refunded" | "partially_refunded") {
  const db = database();
  const ref = db.collection("orders").doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const order = readOrder(snapshot);
    const payment = order.payment;
    if (!payment || payment.checkoutId !== checkoutId) return order;
    const next: OnlinePayment = { status, ...(payment.provider && { provider: payment.provider }), ...(checkoutId && { checkoutId }) };
    let orderStatus = order.status;

    if (status === "paid") {
      if (payment.status === "expired") {
        const products = await transaction.getAll(...order.items.map((item) => db.collection("products").doc(item.productId)));
        const inventory = products.map((product) => product.exists ? readProduct(product) : null);
        if (inventory.every((product, index) => product?.active && canCheckoutProduct(product) && packLabel(product) === order.items[index].size && product.stock >= order.items[index].quantity)) {
          products.forEach((snapshot, index) => {
            const product = inventory[index]!;
            const remaining = product.stock - order.items[index].quantity;
            transaction.update(snapshot.ref, { stock: remaining });
            recordInventory(transaction, product, product.stock, remaining, new Date().toISOString(), { orderId: order.id, simulated: order.simulated === true });
          });
          orderStatus = "placed";
        } else {
          next.status = "refund_required";
        }
      } else if (payment.status !== "pending") return order;
    } else if (status === "expired") {
      if (payment.status !== "pending") return order;
      await restoreInventory(transaction, order);
      orderStatus = "cancelled";
    } else {
      if (payment.status === "refunded" || payment.status === status) return order;
      if (status === "refunded" && (orderStatus === "placed" || orderStatus === "confirmed")) {
        await restoreInventory(transaction, order);
        orderStatus = "cancelled";
      }
    }
    const updated = { ...order, status: orderStatus, payment: next, updatedAt: new Date().toISOString() };
    transaction.update(ref, { status: updated.status, payment: updated.payment, updatedAt: updated.updatedAt });
    return updated;
  });
}

export async function pendingOnlineOrders() {
  const snapshots = await database().collection("orders").where("payment.expiresAt", "<=", new Date().toISOString()).limit(12).get();
  return snapshots.docs.map(readOrder);
}

async function restoreInventory(transaction: FirebaseFirestore.Transaction, order: Order, staffId?: string) {
  const products = await transaction.getAll(...order.items.map((item) => database().collection("products").doc(item.productId)));
  products.forEach((product, index) => {
    if (!product.exists) throw new StoreError("A product from this order is missing from inventory.", 409);
    const current = readProduct(product);
    const restored = current.stock + order.items[index].quantity;
    transaction.update(product.ref, { stock: restored });
    if (current.stockVerified) recordInventory(transaction, current, current.stock, restored, new Date().toISOString(), {
      ...(staffId && { staffId }), orderId: order.id, simulated: orderOperationsMode(order, isDemoStore()) === "simulated",
    });
  });
}

export async function trackOrder(id: string, phone: string, review?: true): Promise<TrackingResult> {
  const db = database();
  const snapshot = await db.collection("orders").doc(id).get();
  if (!snapshot.exists) throw new StoreError("No order matches that reference and phone number.", 404);
  const order = readOrder(snapshot);
  if (order.customer.phone !== phone) throw new StoreError("No order matches that reference and phone number.", 404);
  const recorded = order.fulfilmentEvents?.map(({ status, at }) => ({ status, at })) ?? [];
  const events: TrackingResult["events"] = recorded[0]?.status === "placed" ? recorded : [{ status: "placed", at: order.createdAt }, ...recorded];
  if (events.at(-1)?.status !== order.status) events.push({ status: order.status });
  const summary: TrackingResult = { ...toSummary(order), mode: orderOperationsMode(order, isDemoStore()), events };
  if (!review || !order.items.length) return summary;

  const products = await db.getAll(...order.items.map((item) => db.collection("products").doc(item.productId)));
  const reorder = order.items.map((original, index) => {
    const item = products[index];
    return { original, current: item.exists && item.get("active") === true ? publicProduct(readProduct(item)) : null };
  });
  return { ...summary, reorder };
}

export async function listProducts(): Promise<ProductRecord[]> {
  const result = await database().collection("products").get();
  return result.docs.map(readProductRecord).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

export function readProductRecord(snapshot: DocumentSnapshot): ProductRecord {
  return { ...readProduct(snapshot), version: version(snapshot) };
}

export async function listInventoryEvents(): Promise<InventoryEvent[]> {
  const result = await database().collection("inventoryEvents").orderBy("at", "desc").limit(30).get();
  return result.docs.map((snapshot) => snapshot.data() as InventoryEvent);
}

function withStockSpecification(product: Product, prior: Product | null): Product {
  const fingerprint = (entry: Product) => createHash("sha256").update(productSpecification(entry)).digest("hex");
  const specification = fingerprint(product);
  const locked = prior?.stockSpecification ?? (prior?.checkoutApproved ? fingerprint(prior) : undefined);
  if (locked && locked !== specification) {
    throw new StoreError(`${product.name} already has a confirmed stock unit. Use a new SKU for a different pack so existing orders keep the correct stock unit.`, 409);
  }
  const saved = { ...product };
  delete saved.stockSpecification;
  delete saved.quotePrice;
  const confirmed = locked ?? (product.checkoutApproved ? specification : undefined);
  if (confirmed) saved.stockSpecification = confirmed;
  return saved;
}

export async function saveProduct(product: Product, priorVersion: string | null, staffId: string): Promise<void> {
  const db = database();
  const ref = db.collection("products").doc(product.id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const prior = snapshot.exists ? readProduct(snapshot) : null;
    const saved = withStockSpecification(product, prior);
    if (priorVersion === null) {
      if (snapshot.exists) throw new StoreError("That product identifier is already used.", 409);
      transaction.create(ref, saved);
    } else {
      if (!snapshot.exists || version(snapshot) !== priorVersion) throw new StoreError("This product changed since you opened it. Refresh the list before editing again.", 409);
      transaction.set(ref, saved);
    }
    recordInventory(transaction, saved, prior?.stockVerified ? prior.stock : null, saved.stockVerified ? saved.stock : null, new Date().toISOString(), { staffId });
  });
}

function applyCatalogueUpdate(prior: Product, row: CatalogueUpdate, index: number): Product {
  const draft: Product = {
    ...prior,
    size: row.saleUnit === "bundle" ? "1 bundle" : row.size,
    price: row.price,
    comparePrice: !prior.demo && row.price !== null && (prior.comparePrice ?? 0) > row.price ? prior.comparePrice : null,
    stock: row.stock ?? 0,
    purchaseMode: row.purchaseMode,
  };
  delete draft.demo;
  delete draft.checkoutApproved;
  delete draft.stockVerified;
  delete draft.saleUnit;
  delete draft.itemsPerUnit;
  delete draft.unitsPerCarton;
  delete draft.containedUnit;
  delete draft.totalSize;
  if (row.saleUnit) draft.saleUnit = row.saleUnit;
  if (row.stock !== null) draft.stockVerified = true;
  if (row.checkoutApproved) draft.checkoutApproved = true;
  if (row.pricePublished === true) draft.pricePublished = true;
  if (row.pricePublished === false || row.price === null) delete draft.pricePublished;
  if (isMultiUnit(draft.saleUnit)) {
    if (row.itemsPerUnit !== null) draft.itemsPerUnit = row.itemsPerUnit;
    if (row.containedUnit) draft.containedUnit = row.containedUnit;
    if (row.totalSize) draft.totalSize = row.totalSize;
  }
  if (productSpecification(prior) !== productSpecification(draft)) delete draft.shippingWeightGrams;
  const result = productSchema.safeParse(draft);
  if (!result.success) {
    throw new ZodError(result.error.issues.map((issue) => ({
      ...issue, path: ["updates", index, ...issue.path], message: `${prior.name}: ${issue.message}`,
    })));
  }
  return withStockSpecification(result.data, prior);
}

export async function updateCatalogue(rows: CatalogueUpdate[], staffId: string): Promise<ProductRecord[]> {
  const db = database();
  const refs = rows.map(({ id }) => db.collection("products").doc(id));
  const reviewed = rows.filter(({ suggestionVersion }) => suggestionVersion !== undefined);
  const suggestionRefs = reviewed.map(({ id }) => db.collection(catalogueSuggestionsCollection).doc(id));
  await db.runTransaction(async (transaction) => {
    const reads = await transaction.getAll(...refs, ...suggestionRefs);
    const snapshots = reads.slice(0, refs.length);
    reads.slice(refs.length).forEach((snapshot, index) => {
      const row = reviewed[index];
      if (snapshot.get("suggestionVersion") !== row.suggestionVersion) {
        throw new StoreError("A submitted update changed. Reload the catalogue and review it again.", 409);
      }
    });
    const changes = snapshots.map((snapshot, index) => {
      const prior = snapshot.exists ? readProduct(snapshot) : null;
      const row = rows[index];
      if (!prior) throw new StoreError(`The product ${row.id} is no longer in the catalogue. Refresh before saving again.`, 409);
      if (version(snapshot) !== row.version) {
        throw new StoreError(`${prior.name} changed while you were editing. Refresh the catalogue and review that product before saving.`, 409);
      }
      return { prior, saved: applyCatalogueUpdate(prior, row, index) };
    });
    const now = new Date().toISOString();
    changes.forEach(({ prior, saved }, index) => {
      transaction.set(snapshots[index].ref, saved);
      const before = prior.stockVerified ? prior.stock : null;
      const after = saved.stockVerified ? saved.stock : null;
      if (before !== null && productSpecification(prior) !== productSpecification(saved)) {
        recordInventory(transaction, prior, before, null, now, { staffId });
        recordInventory(transaction, saved, null, after, now, { staffId });
      } else {
        recordInventory(transaction, saved, before, after, now, { staffId });
      }
    });
    suggestionRefs.forEach((ref) => transaction.delete(ref));
  });
  return (await db.getAll(...refs)).map(readProductRecord);
}

export async function updateBulkPricing(rows: z.output<typeof bulkPricingSchema>, staffId: string) {
  const db = database();
  return db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...rows.map((row) => db.collection("products").doc(row.id)));
    const products = snapshots.map((snapshot, index) => {
      const row = rows[index];
      if (!snapshot.exists || version(snapshot) !== row.version) {
        throw new StoreError("At least one product changed during editing. Refresh the catalogue and try again.", 409);
      }
      const product = readProduct(snapshot);
      if (!canCheckoutProduct(product)) throw new StoreError(`Confirm the specification and stock for ${product.name} in the product editor first.`, 409);
      const { checkoutApproved, pricePublished, ...draft } = product;
      const revised = productSchema.parse({
        ...draft, price: row.price, stock: row.stock,
        comparePrice: row.price !== null && (product.comparePrice ?? 0) > row.price ? product.comparePrice : null,
        ...(checkoutApproved && row.price !== null && { checkoutApproved }),
        ...(pricePublished && row.price !== null && { pricePublished }),
      });
      return { product: revised, previous: product.stock };
    });
    const now = new Date().toISOString();
    products.forEach(({ product, previous }, index) => {
      transaction.set(snapshots[index].ref, product);
      recordInventory(transaction, product, previous, product.stock, now, { staffId });
    });
  });
}

const ORDER_PAGE_SIZE = 30;
export async function listOrders(after?: string) {
  const orders = database().collection("orders");
  let query = orders.orderBy("createdAt", "desc").limit(ORDER_PAGE_SIZE + 1);
  if (after) {
    const snapshot = await orders.doc(after).get();
    if (!snapshot.exists) throw new StoreError("That order page has expired. Refresh the list.", 400);
    query = query.startAfter(snapshot);
  }
  const result = await query.get();
  const page = result.docs.slice(0, ORDER_PAGE_SIZE);
  return { orders: page.map(readOrder), next: result.size > ORDER_PAGE_SIZE ? page.at(-1)?.id ?? null : null };
}

export async function updateOrderStatus(id: string, status: OrderStatus, staffId: string) {
  const db = database();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(db.collection("orders").doc(id));
    if (!snapshot.exists) throw new StoreError("Order not found.", 404);
    const order = readOrder(snapshot);
    if (order.status === status) return order;
    if (!nextStatuses[order.status].includes(status)) {
      throw new StoreError("This status change isn’t available. Refresh the order and try again.", 409);
    }
    if (status !== "cancelled" && !reliableFulfilment(order, isDemoStore())) {
      throw new StoreError("Fulfilment is unavailable for test orders or orders with unconfirmed provenance.", 409);
    }
    if (order.payment && order.payment.status !== "paid") {
      throw new StoreError("Review this order’s online payment before changing fulfilment.", 409);
    }
    let payment = order.payment;
    if (status === "cancelled") {
      await restoreInventory(transaction, order, staffId);
      if (payment) payment = { ...payment, status: "refund_required" };
    }
    const updatedAt = new Date().toISOString();
    const fulfilmentEvents = [...(order.fulfilmentEvents ?? []), { status, at: updatedAt, staffId }];
    const change = { status, updatedAt, fulfilmentEvents, ...(payment && { payment }) };
    transaction.update(snapshot.ref, change);
    return { ...order, ...change };
  });
}
