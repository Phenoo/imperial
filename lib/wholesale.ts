import type { SellingUnit } from "./commerce";

export const wholesaleUnits = ["carton", "case", "bag", "bottle", "tin", "pack", "bundle", "unit"] as const;
export const wholesaleStatuses = ["new", "contacted", "quoted", "accepted", "closed"] as const;
export const MAX_WHOLESALE_ITEMS = 10;
export const MAX_WHOLESALE_QUANTITY = 10000;

export type WholesaleUnit = typeof wholesaleUnits[number];
export type WholesaleStatus = typeof wholesaleStatuses[number];

export const wholesaleUnitLabel: Record<WholesaleUnit, string> = {
  carton: "Cartons", case: "Cases", bag: "Bags", bottle: "Bottles", tin: "Tins", pack: "Packs", bundle: "Bundles", unit: "Individual items",
};

export const wholesaleStatusLabel: Record<WholesaleStatus, string> = {
  new: "Requested", contacted: "Under review", quoted: "Quoted", accepted: "Accepted", closed: "Closed",
};

export const nextWholesaleStatuses: Record<WholesaleStatus, readonly WholesaleStatus[]> = {
  new: ["contacted", "closed"],
  contacted: ["closed"],
  quoted: ["accepted", "closed"],
  accepted: ["closed"],
  closed: [],
};

export function wholesaleQuantityLabel(quantity: number, unit: WholesaleUnit) {
  return `${quantity} ${quantity === 1 ? (unit === "unit" ? "individual item" : unit) : wholesaleUnitLabel[unit].toLowerCase()}`;
}

export function canPrepareWholesaleQuote(status: WholesaleStatus) {
  return status === "new" || status === "contacted" || status === "quoted";
}
export function quoteUnit(unit?: SellingUnit): WholesaleUnit {
  return unit === "each" ? "unit" : (unit ?? "carton");
}
