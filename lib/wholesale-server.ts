import "server-only";
import { createHash } from "node:crypto";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import type { z } from "zod";
import { knownProductDetails } from "./catalog";
import { database } from "./firebase-server";
import { StoreError } from "./store-server";
import { packLabel } from "./commerce";
import {
  productSchema, wholesaleRecordSchema,
  type wholesaleInquirySchema, type WholesalePage, type WholesaleQuoteInput, type WholesaleRequest,
} from "./validation";
import { canPrepareWholesaleQuote, nextWholesaleStatuses, quoteUnit, wholesaleQuantityLabel, type WholesaleStatus } from "./wholesale";

const PAGE_SIZE = 30;
const collection = () => database().collection("wholesaleRequests");
const quoteDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" });

function todayInLagos() {
  return quoteDay.format(new Date());
}

function readRequest(snapshot: DocumentSnapshot) {
  return wholesaleRecordSchema.parse({ ...snapshot.data(), id: snapshot.id });
}

export async function submitWholesaleRequest({ key, contact, items }: z.output<typeof wholesaleInquirySchema>) {
  const id = `WQ-${createHash("sha256").update(key.toLowerCase()).digest("hex").slice(0, 24).toUpperCase()}`;
  const digest = createHash("sha256").update(JSON.stringify({ contact, items })).digest("hex");
  const reference = collection().doc(id);
  const db = database();

  return db.runTransaction(async (transaction) => {
    const previous = await transaction.get(reference);
    if (previous.exists) {
      if (previous.get("digest") !== digest) throw new StoreError("This request reference has already been used.", 409);
      return { id };
    }

    const snapshots = await transaction.getAll(...items.map((item) => db.collection("products").doc(item.productId)));
    const requestedItems = items.map((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists || snapshot.get("active") !== true) {
        throw new StoreError("A selected product is no longer listed. Refresh and review your request.", 409);
      }
      const product = knownProductDetails(productSchema.parse({ ...snapshot.data(), id: snapshot.id }));
      const minimum = product.minimumQuantity ?? 1;
      if (product.saleUnit && item.unit === quoteUnit(product.saleUnit) && item.quantity < minimum) {
        throw new StoreError(`Request at least ${wholesaleQuantityLabel(minimum, item.unit)} of ${product.name}.`, 400);
      }
      return { ...item, name: product.name, size: packLabel(product), ...(product.sku && { sku: product.sku }) };
    });

    const request: WholesaleRequest = { id, contact, items: requestedItems, status: "new", createdAt: new Date().toISOString() };
    transaction.create(reference, { ...request, digest });
    return { id };
  });
}

export async function listWholesaleRequests(after?: string): Promise<WholesalePage> {
  const requests = collection();
  let query = requests.orderBy("createdAt", "desc").limit(PAGE_SIZE + 1);
  if (after) {
    const cursor = await requests.doc(after).get();
    if (!cursor.exists) throw new StoreError("That request page has expired. Refresh the list.", 400);
    query = query.startAfter(cursor);
  }
  const result = await query.get();
  const page = result.docs.slice(0, PAGE_SIZE);
  return { requests: page.map(readRequest), next: result.size > PAGE_SIZE ? page[PAGE_SIZE - 1].id : null };
}

export async function updateWholesaleStatus(id: string, status: WholesaleStatus) {
  const reference = collection().doc(id);
  return database().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new StoreError("Wholesale request not found.", 404);
    const request = readRequest(snapshot);
    if (request.status === status) return request;
    if (!nextWholesaleStatuses[request.status].includes(status)) {
      throw new StoreError("This request status has changed. Refresh the list and try again.", 409);
    }
    if (status === "accepted" && (!request.quote || request.quote.validUntil < todayInLagos())) {
      throw new StoreError("Update the quotation’s validity before marking it accepted.", 409);
    }
    transaction.update(reference, { status });
    return { ...request, status };
  });
}

export async function saveWholesaleQuote(id: string, value: WholesaleQuoteInput, previousQuoteAt: string | null) {
  const reference = collection().doc(id);
  return database().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new StoreError("Wholesale request not found.", 404);
    const request = readRequest(snapshot);
    if (!canPrepareWholesaleQuote(request.status) || (request.quote?.updatedAt ?? null) !== previousQuoteAt) {
      throw new StoreError("The quotation has changed. Refresh it before editing.", 409);
    }
    if (value.items.length !== request.items.length || request.items.some((item) => !value.items.some((line) => line.productId === item.productId))) {
      throw new StoreError("Include a confirmed line for every requested product variant.", 400);
    }
    if (value.validUntil < todayInLagos()) throw new StoreError("Use a quotation expiry date on or after today.", 400);

    const subtotal = value.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const updatedAt = new Date(Math.max(Date.now(), previousQuoteAt ? Date.parse(previousQuoteAt) + 1 : 0)).toISOString();
    const quote = { ...value, subtotal, total: subtotal + value.delivery, updatedAt };
    transaction.update(reference, { quote, status: "quoted" });
    return { ...request, quote, status: "quoted" as const };
  });
}
