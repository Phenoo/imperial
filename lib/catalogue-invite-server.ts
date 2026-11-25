import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { catalogueSuggestionsCollection, type CatalogueInvite, type CatalogueInviteStatus, type CatalogueSuggestion, type SharedCatalogue, type SharedCatalogueProduct } from "./catalogue-invite";
import { isMultiUnit, productSpecification } from "./commerce";
import { database } from "./firebase-server";
import { readProductRecord, StoreError, type ProductRecord } from "./store-server";
import { catalogueDetailsSchema, suggestionVersionSchema } from "./validation";

const inviteLifetime = 14 * 24 * 60 * 60 * 1000;
const inviteHash = z.string().regex(/^[a-f0-9]{64}$/);
const inviteSchema = z.object({
  hash: inviteHash.nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revoked: z.boolean(),
});
type InviteRecord = z.output<typeof inviteSchema>;
type Snapshot = FirebaseFirestore.DocumentSnapshot;

const suggestionSchema = catalogueDetailsSchema.extend({
  suggestionVersion: suggestionVersionSchema,
  updatedAt: z.iso.datetime(),
});
const suggestionInputSchema = catalogueDetailsSchema.strict().extend({
  suggestionVersion: suggestionVersionSchema.nullable(),
}).refine((row) => isMultiUnit(row.saleUnit ?? undefined) || (!row.itemsPerUnit && !row.containedUnit && !row.totalSize), {
  path: ["saleUnit"], message: "Select pack, case or carton before entering its contents.",
});
export const suggestionsSchema = z.strictObject({
  updates: z.array(suggestionInputSchema).min(1).max(100)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, "Each product may appear only once."),
});
export const dismissSuggestionsSchema = z.strictObject({
  dismiss: z.array(suggestionSchema.pick({ id: true, suggestionVersion: true }).strict()).min(1).max(100)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, "Each product may appear only once."),
});

function fingerprint(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function inviteRef() {
  return database().collection("catalogueInvites").doc("active");
}

function readInvite(snapshot: Snapshot): InviteRecord | null {
  if (snapshot.exists) return inviteSchema.parse(snapshot.data());
  const hash = inviteHash.safeParse(process.env.CATALOGUE_INVITE_BOOTSTRAP_SHA256);
  const expiry = z.iso.datetime().safeParse(process.env.CATALOGUE_INVITE_BOOTSTRAP_EXPIRES_AT);
  if (!hash.success || !expiry.success) return null;
  const createdAt = new Date(Date.parse(expiry.data) - inviteLifetime).toISOString();
  return { hash: hash.data, createdAt, expiresAt: expiry.data, revoked: false };
}

function inviteSummary(record: InviteRecord): CatalogueInvite {
  return {
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    status: record.revoked ? "revoked" : Date.parse(record.expiresAt) > Date.now() ? "active" : "expired",
  };
}

function inactiveInvite() {
  return new StoreError("This catalogue link is invalid, expired or turned off. Ask Imperial for a new link.", 403);
}

export function inviteToken(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
  if (!token) throw inactiveInvite();
  return token;
}

function requireInvite(snapshot: Snapshot, token: string): CatalogueInvite {
  const record = readInvite(snapshot);
  if (!record?.hash || !timingSafeEqual(Buffer.from(record.hash, "hex"), Buffer.from(fingerprint(token), "hex"))) {
    throw inactiveInvite();
  }
  const summary = inviteSummary(record);
  if (summary.status !== "active") throw inactiveInvite();
  return summary;
}

function packLocked(product: ProductRecord) {
  return Boolean(product.stockSpecification || product.checkoutApproved || product.saleUnit === "bundle");
}

function catalogueFields(product: ProductRecord) {
  const multi = isMultiUnit(product.saleUnit);
  return {
    saleUnit: product.saleUnit ?? null,
    size: /^sample\b/i.test(product.size) ? "" : product.size,
    itemsPerUnit: multi ? product.itemsPerUnit ?? product.unitsPerCarton ?? null : null,
    containedUnit: multi ? product.containedUnit ?? null : null,
    totalSize: multi ? product.totalSize ?? "" : "",
  };
}

function sharedProduct(product: ProductRecord, suggestion: CatalogueSuggestion | null): SharedCatalogueProduct {
  const { id, version, name, brand, category, image, sku, bundleContents } = product;
  const currentSuggestion = suggestion?.version === version ? suggestion : null;
  const fields = currentSuggestion ? {
    saleUnit: currentSuggestion.saleUnit,
    size: currentSuggestion.size,
    itemsPerUnit: currentSuggestion.itemsPerUnit,
    containedUnit: currentSuggestion.containedUnit,
    totalSize: currentSuggestion.totalSize,
  } : catalogueFields(product);
  return { id, version, name, brand, category, image, sku, bundleContents, ...fields,
    price: currentSuggestion?.price ?? null,
    stock: currentSuggestion?.stock ?? null,
    packLocked: packLocked(product),
    suggestionVersion: currentSuggestion?.suggestionVersion ?? null,
  };
}

function readSuggestion(snapshot: Snapshot): CatalogueSuggestion | null {
  return snapshot.exists ? suggestionSchema.parse(snapshot.data()) : null;
}

export async function getSharedCatalogue(token: string): Promise<SharedCatalogue> {
  const invite = requireInvite(await inviteRef().get(), token);
  const db = database();
  const [products, suggestions] = await Promise.all([
    db.collection("products").where("active", "==", true).get(),
    db.collection(catalogueSuggestionsCollection).get(),
  ]);
  const pending = new Map(suggestions.docs.map((snapshot) => [snapshot.id, readSuggestion(snapshot)]));
  return {
    expiresAt: invite.expiresAt,
    products: products.docs.map(readProductRecord).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map((product) => sharedProduct(product, pending.get(product.id) ?? null)),
  };
}

export async function saveSharedCatalogue(token: string, { updates }: z.output<typeof suggestionsSchema>): Promise<SharedCatalogue> {
  const db = database();
  const productRefs = updates.map(({ id }) => db.collection("products").doc(id));
  const suggestionRefs = updates.map(({ id }) => db.collection(catalogueSuggestionsCollection).doc(id));
  return db.runTransaction(async (transaction) => {
    const invite = requireInvite(await transaction.get(inviteRef()), token);
    const reads = await transaction.getAll(...productRefs, ...suggestionRefs);
    const updatedAt = new Date().toISOString();
    const products = updates.map((fields, index) => {
      if (!reads[index].exists || reads[index].get("active") !== true) {
        throw new StoreError("A product is no longer available. Reload the catalogue and try again.", 409);
      }
      const product = readProductRecord(reads[index]);
      const previous = readSuggestion(reads[index + updates.length]);
      const previousVersion = previous?.version === product.version ? previous.suggestionVersion : null;
      if (product.version !== fields.version || previousVersion !== fields.suggestionVersion) {
        throw new StoreError(`${product.name} changed. Reload the catalogue and review your updates.`, 409);
      }
      const pack = {
        saleUnit: fields.saleUnit ?? undefined, size: fields.size, itemsPerUnit: fields.itemsPerUnit ?? undefined,
        containedUnit: fields.containedUnit ?? undefined, totalSize: fields.totalSize || undefined, bundleContents: product.bundleContents,
      };
      if (packLocked(product) && productSpecification(pack) !== productSpecification(product)) {
        throw new StoreError(`The pack details for ${product.name} are fixed. You can submit its price and stock.`, 409);
      }
      const suggestion = { ...fields, ...(packLocked(product) && catalogueFields(product)), updatedAt, suggestionVersion: randomBytes(16).toString("hex") };
      return { product, suggestion };
    });
    products.forEach(({ suggestion }, index) => transaction.set(suggestionRefs[index], suggestion));
    return { expiresAt: invite.expiresAt, products: products.map(({ product, suggestion }) => sharedProduct(product, suggestion)) };
  });
}

export async function getCatalogueInviteStatus(): Promise<CatalogueInviteStatus> {
  const [snapshot, pending] = await Promise.all([inviteRef().get(), database().collection(catalogueSuggestionsCollection).get()]);
  const record = readInvite(snapshot);
  return {
    invite: record ? inviteSummary(record) : null,
    suggestions: pending.docs.map((item) => suggestionSchema.parse(item.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export async function createCatalogueInvite() {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const record: InviteRecord = { hash: fingerprint(token), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + inviteLifetime).toISOString(), revoked: false };
  await inviteRef().set(record);
  return { invite: inviteSummary(record), token };
}

export async function revokeCatalogueInvite(): Promise<CatalogueInvite | null> {
  const ref = inviteRef();
  return database().runTransaction(async (transaction) => {
    const record = readInvite(await transaction.get(ref));
    if (!record) return null;
    const revoked: InviteRecord = { ...record, revoked: true, hash: null };
    transaction.set(ref, revoked);
    return inviteSummary(revoked);
  });
}

export async function dismissCatalogueSuggestions({ dismiss }: z.output<typeof dismissSuggestionsSchema>) {
  const db = database();
  const refs = dismiss.map(({ id }) => db.collection(catalogueSuggestionsCollection).doc(id));
  await db.runTransaction(async (transaction) => {
    const reads = await transaction.getAll(...refs);
    if (reads.some((snapshot, index) => snapshot.get("suggestionVersion") !== dismiss[index].suggestionVersion)) {
      throw new StoreError("A submitted update changed. Reload the catalogue and review it again.", 409);
    }
    refs.forEach((ref) => transaction.delete(ref));
  });
  return { dismissed: refs.length };
}
