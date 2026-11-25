import { z } from "zod";
import { MAX_ORDER_LINES, MAX_PER_ITEM, categories, containedUnits, deliveryZones, hasExactPack, isMultiUnit, normalizePhone, orderStatuses, purchaseModes, sellingUnits } from "./commerce";
import { MAX_WHOLESALE_ITEMS, MAX_WHOLESALE_QUANTITY, wholesaleStatuses, wholesaleUnits } from "./wholesale";
import { nigerianStates } from "./nigerian-states";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const productId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const phone = z.string().trim().regex(/^\+?[\d ()-]{10,20}$/, "Enter a valid Nigerian phone number.")
  .transform(normalizePhone).pipe(z.string().regex(/^0[789]\d{9}$/, "Enter a valid Nigerian mobile number."));
export const orderId = z.string().trim().toUpperCase().regex(/^IP-[A-F0-9]{24}$/);

export const checkoutSchema = z.object({
  key: z.uuid(),
  items: z.array(z.object({ productId, quantity: z.number().int().min(1).max(MAX_PER_ITEM), price: z.number().int().positive() })).min(1).max(MAX_ORDER_LINES)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, "Each product may appear only once."),
  customer: z.object({
    name: text(2, 90),
    phone,
    email: z.string().trim().max(150).pipe(z.union([z.email(), z.literal("")])),
    address: text(8, 250),
    zone: z.enum(deliveryZones.map((zone) => zone.id)),
    notes: text(0, 350),
  }),
});
export const trackSchema = z.object({ id: orderId, phone, review: z.literal(true).optional() });

const productImageUrl = z.string().max(1000).refine((value) => {
  if (/^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(webp|png|jpe?g|avif)$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use a local /images/ file or an HTTPS image URL.");

export const productSchema = z.object({
  id: productId, sku: text(1, 80).optional(), variantGroup: productId.optional(),
  name: text(3, 110), brand: text(1, 45), category: z.enum(categories.map((category) => category.id)),
  origin: text(0, 65), size: text(0, 35), price: z.number().int().positive().max(10000000).nullable(),
  saleUnit: z.enum(sellingUnits).optional(), itemsPerUnit: z.number().int().positive().max(1000).optional(),
  unitsPerCarton: z.number().int().positive().max(1000).optional(),
  containedUnit: z.enum(containedUnits).optional(), totalSize: text(1, 35).optional(),
  minimumQuantity: z.number().int().min(1).max(MAX_PER_ITEM).optional(),
  shippingWeightGrams: z.number().int().positive().max(100000000).optional(),
  deliveryQuoteOnly: z.literal(true).optional(),
  bundleContents: z.array(text(3, 160)).min(1).max(25).optional(),
  purchaseMode: z.enum(purchaseModes).optional(),
  pricePublished: z.literal(true).optional(),
  checkoutApproved: z.literal(true).optional(), stockVerified: z.literal(true).optional(),
  stockSpecification: text(1, 180).optional(),
  demo: z.literal(true).optional(),
  comparePrice: z.number().int().positive().max(10000000).nullable(),
  stock: z.number().int().min(0).max(1000000), rank: z.number().int().min(0).max(1000000),
  image: productImageUrl,
  labelImages: z.array(productImageUrl).max(6).optional(),
  food: z.object({
    ingredients: text(1, 1200).optional(), allergens: text(1, 1200).optional(),
    storage: text(1, 1200).optional(), afterOpening: text(1, 1200).optional(),
    preparation: text(1, 1200).optional(), manufacturer: text(1, 150).optional(),
    country: text(1, 100).optional(), registration: text(1, 200).optional(), shelfLife: text(1, 400).optional(),
  }).optional(),
  description: text(10, 1200), active: z.boolean(), featured: z.boolean(),
}).refine((value) => !value.pricePublished || (value.price !== null && !value.demo), {
  path: ["pricePublished"], message: "Enter the confirmed price before showing it on quote-only listings.",
}).refine((value) => value.comparePrice === null || (value.price !== null && value.comparePrice > value.price), {
  path: ["comparePrice"], message: "The original price must be higher than the selling price.",
}).refine((value) => !value.unitsPerCarton || value.saleUnit === "carton", {
  path: ["unitsPerCarton"], message: "Select carton before entering its unit count.",
}).refine((value) => (!value.itemsPerUnit && !value.containedUnit) || isMultiUnit(value.saleUnit), {
  path: ["itemsPerUnit"], message: "Select pack, case or carton before entering its contents.",
}).refine((value) => !value.checkoutApproved || (hasExactPack(value) && value.price !== null &&
  value.stockVerified && value.purchaseMode && value.purchaseMode !== "quote" && !value.demo), {
  path: ["checkoutApproved"], message: "To enable checkout, confirm the exact selling unit, contents, price and stock, and select a purchasing route.",
});

export const orderUpdateSchema = z.object({ id: orderId, status: z.enum(orderStatuses) });
export const bulkPricingSchema = z.array(z.object({
  id: productId, version: text(1, 40), price: z.number().int().positive().max(10000000).nullable(),
  stock: z.number().int().min(0).max(1000000), approved: z.boolean(),
})).min(1).max(100).refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, "Each product may appear only once.");

export const catalogueDetailsSchema = z.object({
  id: productId,
  version: text(1, 40),
  saleUnit: z.enum(sellingUnits).nullable(),
  size: text(0, 35),
  itemsPerUnit: z.number().int().min(1).max(1000).nullable(),
  containedUnit: z.enum(containedUnits).nullable(),
  totalSize: text(0, 35),
  price: z.number().int().positive().max(10000000).nullable(),
  stock: z.number().int().min(0).max(1000000).nullable(),
});

export const suggestionVersionSchema = z.string().regex(/^[a-f0-9]{32}$/);
const catalogueUpdate = catalogueDetailsSchema.extend({
  purchaseMode: z.enum(purchaseModes),
  checkoutApproved: z.boolean(),
  pricePublished: z.boolean().optional(),
  suggestionVersion: suggestionVersionSchema.optional(),
});

export type CatalogueUpdate = z.output<typeof catalogueUpdate>;

export const catalogueUpdateSchema = z.object({
  updates: z.array(catalogueUpdate).min(1).max(100)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, "Each product may appear only once."),
});

export const wholesaleId = z.string().regex(/^WQ-[A-F0-9]{24}$/);
const wholesaleItem = z.object({
  productId,
  quantity: z.number().int().min(1).max(MAX_WHOLESALE_QUANTITY),
  unit: z.enum(wholesaleUnits),
});
const wholesaleContact = z.object({
  name: text(2, 90),
  business: text(0, 100),
  phone,
  email: z.string().trim().max(150).pipe(z.union([z.email(), z.literal("")])),
  location: text(2, 120),
  state: z.enum(nigerianStates).optional(),
  preferredTiming: text(0, 100).optional(),
  notes: text(0, 500),
});

export const wholesaleInquirySchema = z.object({
  key: z.uuid(),
  contact: wholesaleContact,
  items: z.array(wholesaleItem).min(1).max(MAX_WHOLESALE_ITEMS)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, "Each product may appear only once."),
});

const quoteLineSchema = wholesaleItem.extend({
  specification: text(3, 150),
  unitPrice: z.number().int().positive().max(10000000),
});
const quoteSchema = z.object({
  items: z.array(quoteLineSchema).min(1).max(MAX_WHOLESALE_ITEMS)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, "Each product may appear only once."),
  delivery: z.number().int().min(0).max(10000000),
  validUntil: z.iso.date(),
});
export type WholesaleQuoteInput = z.output<typeof quoteSchema>;

export const wholesaleRecordSchema = z.object({
  id: wholesaleId,
  contact: wholesaleContact,
  items: z.array(wholesaleItem.extend({ name: text(3, 110), size: text(0, 160), sku: text(1, 80).optional() })).min(1).max(MAX_WHOLESALE_ITEMS),
  status: z.enum(wholesaleStatuses),
  createdAt: z.iso.datetime(),
  quote: quoteSchema.extend({
    subtotal: z.number().int().positive(),
    total: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  }).optional(),
});

export type WholesaleRequest = z.output<typeof wholesaleRecordSchema>;
export type WholesalePage = { requests: WholesaleRequest[]; next: string | null };
export const wholesaleUpdateSchema = z.union([
  z.object({ id: wholesaleId, status: z.enum(wholesaleStatuses) }),
  z.object({ id: wholesaleId, quote: quoteSchema, previousQuoteAt: z.iso.datetime().nullable() }),
]);
