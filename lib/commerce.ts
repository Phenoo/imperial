export const categories = [
  { id: "rice", name: "Rice & Grains", image: "/images/category-rice.webp", color: "#e5ebd9", note: "Long-grain favourites" },
  { id: "tins", name: "Tins & Cans", image: "/images/category-tins.webp", color: "#f7eace", note: "The good stuff, tinned" },
  { id: "noodles", name: "Noodles & Pasta", image: "/images/category-noodles.webp", color: "#f2e2d8", note: "Dinner in minutes" },
  { id: "drinks", name: "Drinks & Juices", image: "/images/category-drinks.webp", color: "#f7e5be", note: "Something to sip" },
  { id: "snacks", name: "Snacks & Biscuits", image: "/images/category-snacks.webp", color: "#f2e2d7", note: "Tea-time essentials" },
  { id: "hampers", name: "Hampers", image: "/images/christmas-table-hamper.webp", color: "#f0e1c4", note: "Christmas hampers and Black Friday bundles" },
  { id: "cooking", name: "Oils & Seasonings", image: "/images/catalog-laser-pomace-olive-oil.webp", color: "#e8edd9", note: "Cooking oils, sauces and seasoning" },
  { id: "breakfast", name: "Breakfast & Dairy", image: "/images/catalog-quaker-white-oats.webp", color: "#f2e8d4", note: "Oats, milk, honey and custard" },
] as const;

export const featuredAisles = categories.slice(0, 5);

export type CategoryId = typeof categories[number]["id"];
export const categoryName = (id: CategoryId) => categories.find((category) => category.id === id)?.name ?? id;

export const sellingUnits = ["each", "bag", "bottle", "tin", "pack", "case", "carton", "bundle"] as const;
export type SellingUnit = typeof sellingUnits[number];
export const containedUnits = ["item", "bag", "bottle", "tin", "pack", "box", "sachet", "jar", "pouch"] as const;
export type ContainedUnit = typeof containedUnits[number];
export const purchaseModes = ["retail", "wholesale", "both", "quote"] as const;
export type PurchaseMode = typeof purchaseModes[number];

export const foodInfoFields = {
  ingredients: "Ingredients",
  allergens: "Allergens",
  storage: "Storage",
  afterOpening: "After opening",
  preparation: "Preparation",
  manufacturer: "Manufacturer",
  country: "Country of origin",
  registration: "Product registration",
  shelfLife: "Best before or remaining shelf life",
} as const;
export type FoodInformation = Partial<Record<keyof typeof foodInfoFields, string>>;

export type Product = {
  id: string;
  sku?: string;
  variantGroup?: string;
  name: string;
  brand: string;
  category: CategoryId;
  origin: string;
  size: string;
  saleUnit?: SellingUnit;
  itemsPerUnit?: number;
  unitsPerCarton?: number;
  containedUnit?: ContainedUnit;
  totalSize?: string;
  minimumQuantity?: number;
  shippingWeightGrams?: number;
  deliveryQuoteOnly?: true;
  bundleContents?: string[];
  purchaseMode?: PurchaseMode;
  checkoutApproved?: true;
  pricePublished?: true;
  stockVerified?: true;
  stockSpecification?: string;
  demo?: true;
  price: number | null;
  quotePrice?: number;
  comparePrice: number | null;
  stock: number;
  image: string;
  labelImages?: string[];
  food?: FoodInformation;
  description: string;
  active: boolean;
  featured: boolean;
  rank: number;
};

type Pack = Pick<Product, "size" | "saleUnit" | "unitsPerCarton" | "itemsPerUnit" | "containedUnit" | "totalSize" | "bundleContents">;

export function isMultiUnit(unit: SellingUnit | undefined) {
  return unit === "pack" || unit === "case" || unit === "carton";
}

function itemMeasure(size: string) {
  const amount = size.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:kg|g|mg|l|ml|cl|oz|lb)$/i);
  return Boolean(amount && Number(amount[1].replace(",", ".")) > 0);
}

export function hasExactPack(product: Pack) {
  const { saleUnit, size, containedUnit, bundleContents } = product;
  if (!saleUnit) return false;
  if (saleUnit === "bundle") return Boolean(bundleContents?.length);
  if (!itemMeasure(size)) return false;
  const count = product.itemsPerUnit ?? product.unitsPerCarton;
  if (!isMultiUnit(saleUnit) || (saleUnit === "pack" && !count && !containedUnit)) return true;
  return Boolean(count && containedUnit);
}

export function sellingUnitLabel(unit: SellingUnit | undefined, quantity = 1) {
  const name = unit === "each" || !unit ? "item" : unit;
  return quantity === 1 ? name : `${name}s`;
}

export function packLabel(product: Pack) {
  const { saleUnit, size, containedUnit, totalSize } = product;
  if (saleUnit === "bundle") return product.bundleContents?.length ? "1 bundle" : "Bundle contents on request";
  if (!saleUnit) return itemMeasure(size) ? size : "Pack details on request";
  const label = sellingUnitLabel(saleUnit);
  if (!hasExactPack(product)) {
    const knownSize = itemMeasure(size) ? ` · ${size} per item` : "";
    return `${label[0].toUpperCase()}${label.slice(1)} details on request${knownSize}`;
  }
  const count = product.itemsPerUnit ?? product.unitsPerCarton;
  if (isMultiUnit(saleUnit) && count && containedUnit) {
    const contents = count === 1 ? containedUnit : `${containedUnit}${containedUnit === "box" ? "es" : "s"}`;
    const total = totalSize ? ` · ${totalSize} total` : "";
    return `${label[0].toUpperCase()}${label.slice(1)} of ${count} × ${size} ${contents}${total}`;
  }
  return `1 × ${size} ${label}`;
}

export function productSpecification(product: Pack) {
  return JSON.stringify([packLabel(product), product.bundleContents ?? []]);
}

export function canCheckoutProduct(product: Product) {
  return product.checkoutApproved === true && product.stockVerified === true && !product.demo &&
    Boolean(product.purchaseMode && product.purchaseMode !== "quote") &&
    product.price !== null && hasExactPack(product);
}

export function publicProduct(product: Product): Product {
  const view = { ...product };
  delete view.stockSpecification;
  delete view.quotePrice;
  if (canCheckoutProduct(product)) return view;
  const quotePrice = product.pricePublished && !product.demo ? product.price ?? product.quotePrice ?? null : null;
  return {
    ...view, price: null, comparePrice: null,
    ...(quotePrice !== null && { quotePrice }),
    size: /^sample\b/i.test(view.size) ? "" : view.size,
  };
}

export function listedPrice(product: Product) {
  return product.price ?? product.quotePrice ?? null;
}

export function productAvailability(product: Product) {
  if (!canCheckoutProduct(product)) return "quote";
  return product.stock >= (product.minimumQuantity ?? 1) ? "in-stock" : "out-of-stock";
}

export const FREE_DELIVERY_MINIMUM = 75000;
export const MAX_PER_ITEM = 25;
export const MAX_ORDER_LINES = 30;

export function productLimit(product: Product) {
  return canCheckoutProduct(product) ? Math.min(product.stock, MAX_PER_ITEM) : 0;
}

export function isPreviewProduct(product: Product): product is Product & { demo: true; price: number } {
  return product.demo === true && product.active && product.price !== null && product.price > 0;
}

export function basketProductLimit(product: Product) {
  return isPreviewProduct(product) ? MAX_PER_ITEM : productLimit(product);
}

export const deliveryZones = [
  { id: "island", name: "Lagos Island", fee: 3000, time: "1–2 business days" },
  { id: "mainland", name: "Lagos Mainland", fee: 3500, time: "1–2 business days" },
  { id: "outer", name: "Ajah & Lekki outskirts", fee: 5000, time: "2–3 business days" },
] as const;

export type ZoneId = typeof deliveryZones[number]["id"];

export type DeliverySettings = {
  freeFrom: number;
  zones: readonly { id: ZoneId; name: string; fee: number; time: string }[];
  minimumSubtotal?: number;
  quoteAboveWeightGrams?: number;
};
export const defaultDelivery: DeliverySettings = { freeFrom: FREE_DELIVERY_MINIMUM, zones: deliveryZones };

export function deliveryFee(zone: ZoneId, subtotal: number, delivery = defaultDelivery) {
  return subtotal >= delivery.freeFrom ? 0 : delivery.zones.find((entry) => entry.id === zone)!.fee;
}

const formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
export function naira(amount: number) { return formatter.format(amount); }

export const orderStatuses = ["placed", "confirmed", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = typeof orderStatuses[number];
export const statusLabel: Record<OrderStatus, string> = {
  placed: "Order placed", confirmed: "Confirmed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled",
};
export const nextStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export type Customer = { name: string; phone: string; email: string; address: string; zone: ZoneId; notes: string };
export type OnlinePaymentStatus = "pending" | "paid" | "expired" | "refund_required" | "partially_refunded" | "refunded";
export const onlinePaymentLabel: Record<OnlinePaymentStatus, string> = {
  pending: "Awaiting online payment", paid: "Paid online", expired: "Payment window expired",
  refund_required: "Refund required", partially_refunded: "Partially refunded", refunded: "Refunded",
};
export type PaymentProvider = "bachs" | "paystack";
export const paymentProviderName = (provider?: PaymentProvider) => provider === "paystack" ? "Paystack" : "Bachs";
export type OnlinePayment = { provider?: PaymentProvider; status: OnlinePaymentStatus; expiresAt?: string; checkoutId?: string; checkoutUrl?: string };
export type OrderLine = { productId: string; name: string; size: string; price: number; quantity: number };
export type Order = {
  id: string; customer: Customer; items: OrderLine[]; subtotal: number; shipping: number; total: number;
  status: OrderStatus; createdAt: string; updatedAt: string;
  simulated?: boolean;
  fulfilmentEvents?: { status: OrderStatus; at: string; staffId?: string }[];
  payment?: OnlinePayment;
};
export type OrderSummary = Pick<Order, "id" | "status" | "subtotal" | "shipping" | "total" | "createdAt" | "updatedAt" | "simulated"> & { paymentStatus?: OnlinePaymentStatus };

export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
}
