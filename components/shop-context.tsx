"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  basketProductLimit, canCheckoutProduct, deliveryZones, isPreviewProduct, MAX_ORDER_LINES, MAX_PER_ITEM, packLabel, productLimit, productSpecification,
  type DeliverySettings, type Product, type ZoneId,
} from "@/lib/commerce";
import { recordShopEvent } from "@/lib/shop-analytics";

export type DeliveryArea = ZoneId | "" | "outside-lagos";
type CartLine = { product: Product & { price: number }; quantity: number };
type ReviewedLine = { price: number; specification: string; pack: string };
export type SavedList = { id: string; name: string; items: Record<string, number> };
type StoreState = {
  cart: Record<string, number>;
  saved: string[];
  reviewed: Record<string, ReviewedLine>;
  area: DeliveryArea;
  lists: SavedList[];
};
const key = "imperial-basket-v1";
const eventName = "imperial:basket";
const empty = '{"cart":{},"saved":[],"reviewed":{},"area":"","lists":[]}';
const productId = /^[a-z0-9-]{1,80}$/;
let ephemeral: string | null = null;

function getSnapshot() {
  try { return ephemeral ?? localStorage.getItem(key) ?? empty; } catch { return ephemeral ?? empty; }
}

const serverSnapshot = () => empty;
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("storage", listener);
  };
}

function quantities(value: unknown) {
  const result: Record<string, number> = Object.create(null);
  if (!value || typeof value !== "object") return result;
  for (const [id, quantity] of Object.entries(value).slice(0, MAX_ORDER_LINES)) {
    if (productId.test(id) && typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0) {
      result[id] = Math.min(quantity, MAX_PER_ITEM);
    }
  }
  return result;
}

function readArea(value: unknown): DeliveryArea {
  if (value === "outside-lagos") return value;
  return deliveryZones.find((zone) => zone.id === value)?.id ?? "";
}

function unpack(value: string): StoreState {
  const fallback: StoreState = { cart: {}, saved: [], reviewed: {}, area: "", lists: [] };
  try {
    const parsed = JSON.parse(value);
    const cart = quantities(parsed?.cart);
    const reviewed: StoreState["reviewed"] = Object.create(null);
    for (const id of Object.keys(cart)) {
      const row = parsed.reviewed?.[id];
      if (typeof row?.price === "number" && typeof row?.specification === "string" && typeof row?.pack === "string") {
        reviewed[id] = { price: row.price, specification: row.specification, pack: row.pack };
      }
    }
    const saved = Array.isArray(parsed?.saved) ? parsed.saved.filter((id: unknown): id is string => typeof id === "string" && productId.test(id)) : [];
    const lists: SavedList[] = [];
    if (Array.isArray(parsed?.lists)) {
      for (const value of parsed.lists.slice(0, 12)) {
        if (typeof value?.id === "string" && typeof value.name === "string") {
          lists.push({ id: value.id, name: value.name.slice(0, 44), items: quantities(value.items) });
        }
      }
    }
    return { cart, reviewed, saved, lists, area: readArea(parsed?.area) };
  } catch {
    return fallback;
  }
}

function update(transform: (state: StoreState) => StoreState) {
  const next = JSON.stringify(transform(unpack(getSnapshot())));
  try { localStorage.setItem(key, next); ephemeral = null; } catch { ephemeral = next; }
  window.dispatchEvent(new Event(eventName));
}

function makeSnapshot(product: CartLine["product"]): ReviewedLine {
  return { price: product.price, specification: productSpecification(product), pack: packLabel(product) };
}

type ShopContextValue = {
  items: CartLine[]; saved: string[]; count: number; unavailableCount: number; subtotal: number; available: boolean;
  delivery: DeliverySettings; area: DeliveryArea; setArea: (area: DeliveryArea) => void; whatsapp: string | null;
  changes: { product: CartLine["product"]; prior?: ReviewedLine }[];
  invalidQuantities: boolean;
  acknowledgeChanges: () => void;
  panel: "cart" | "saved" | null; setPanel: (panel: "cart" | "saved" | null) => void;
  setQuantity: (product: Product, quantity: number) => void; add: (product: Product, quantity?: number) => void;
  toggleSaved: (id: string) => void; clear: () => void; pruneUnavailable: () => void; catalog: Product[];
  addReorder: (lines: { product: Product; quantity: number }[]) => boolean;
  lists: SavedList[]; saveBasketList: (name: string) => boolean; deleteList: (id: string) => void;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children, products, available, delivery, whatsapp = null }: {
  children: ReactNode; products: Product[]; available: boolean; delivery: DeliverySettings; whatsapp?: string | null;
}) {
  const value = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const { cart, saved, reviewed, area, lists } = unpack(value);
  const [panel, setPanel] = useState<ShopContextValue["panel"]>(null);
  const [message, setMessage] = useState({ text: "", sequence: 0 });
  const byId = new Map(products.map((product) => [product.id, product]));
  const items = products.flatMap((product): CartLine[] => {
    if (product.price === null || (!canCheckoutProduct(product) && !isPreviewProduct(product)) || !Object.hasOwn(cart, product.id)) return [];
    return [{ product: { ...product, price: product.price }, quantity: cart[product.id] }];
  });
  const unavailableCount = Object.keys(cart).length - items.length;
  const count = items.reduce((total, { quantity }) => total + quantity, 0);
  const subtotal = items.reduce((total, { product, quantity }) => total + product.price * quantity, 0);
  const invalidQuantities = items.some(({ product, quantity }) => quantity > basketProductLimit(product) || quantity < (product.minimumQuantity ?? 1));
  const changes = items.flatMap(({ product }) => {
    const prior = reviewed[product.id];
    return prior?.price === product.price && prior.specification === productSpecification(product) ? [] : [{ product, prior }];
  });

  const announce = (text: string) => setMessage((previous) => ({ text, sequence: previous.sequence + 1 }));
  function change(product: Product, requested: (existing: number) => number) {
    let outcome = "";
    let analytics: "basket_add" | "basket_remove" | null = null;
    update((state) => {
      const previous = Object.hasOwn(state.cart, product.id) ? state.cart[product.id] : 0;
      const quantity = requested(previous);
      const limit = basketProductLimit(product);
      const minimum = product.minimumQuantity ?? 1;
      if (!Number.isInteger(quantity)) return state;
      if (quantity > previous && quantity > limit) {
        outcome = limit ? `You can add up to ${limit} of ${product.name}.` : `${product.name} isn’t available to order yet.`;
      } else if (quantity > 0 && quantity < minimum) {
        outcome = `Order at least ${minimum} selling units of ${product.name}.`;
      } else if (quantity > 0 && !previous && Object.keys(state.cart).length >= MAX_ORDER_LINES) {
        outcome = "Your basket has reached the maximum number of different products.";
      } else if (quantity <= 0) {
        delete state.cart[product.id];
        delete state.reviewed[product.id];
        if (previous > 0) analytics = "basket_remove";
        outcome = `${product.name} removed.`;
      } else {
        state.cart[product.id] = quantity;
        if (!previous && product.price !== null) state.reviewed[product.id] = makeSnapshot({ ...product, price: product.price });
        if (quantity > previous) analytics = "basket_add";
        if (quantity < previous) analytics = "basket_remove";
        outcome = quantity > previous ? `${product.name} added to your basket.` : "Basket updated.";
      }
      return state;
    });
    if (analytics) recordShopEvent(analytics);
    if (outcome) announce(outcome);
  }

  function addReorder(lines: { product: Product; quantity: number }[]) {
    if (!lines.length || !available) return false;
    let added = false;
    update((state) => {
      const nextCart = { ...state.cart };
      const nextReviewed = { ...state.reviewed };
      for (const { product, quantity } of lines) {
        const current = byId.get(product.id);
        if (!current || current.price === null || current.price !== product.price ||
          productSpecification(current) !== productSpecification(product) || !Number.isInteger(quantity) || quantity <= 0) return state;
        const next = (nextCart[product.id] ?? 0) + quantity;
        if (next < (current.minimumQuantity ?? 1) || next > productLimit(current)) return state;
        nextCart[product.id] = next;
        nextReviewed[product.id] = makeSnapshot({ ...current, price: current.price });
      }
      if (Object.keys(nextCart).length > MAX_ORDER_LINES) return state;
      added = true;
      return { ...state, cart: nextCart, reviewed: nextReviewed };
    });
    if (added) {
      recordShopEvent("reorder_added");
      announce("Items added. Review the current prices in your basket.");
    }
    return added;
  }

  return <ShopContext.Provider value={{
    items, count, subtotal, available, delivery, unavailableCount, panel, setPanel, saved, catalog: products, area, whatsapp,
    changes, invalidQuantities, addReorder, lists,
    setArea: (next) => {
      if (next === area) return;
      update((state) => ({ ...state, area: readArea(next) }));
      recordShopEvent("delivery_area_selected");
    },
    acknowledgeChanges: () => update((state) => ({
      ...state, reviewed: Object.fromEntries(items.map(({ product }) => [product.id, makeSnapshot(product)])),
    })),
    setQuantity: (product, quantity) => change(product, () => quantity),
    add: (product, quantity = product.minimumQuantity ?? 1) => change(product, (previous) => previous + quantity),
    toggleSaved: (id) => update((state) => ({ ...state, saved: state.saved.includes(id) ? state.saved.filter((item) => item !== id) : [...state.saved, id] })),
    clear: () => update((state) => ({ ...state, cart: {}, reviewed: {} })),
    pruneUnavailable: () => update((state) => {
      const resolved = items.map(({ product }) => product.id);
      const keep = ([id]: [string, unknown]) => resolved.includes(id);
      return {
        ...state, cart: Object.fromEntries(Object.entries(state.cart).filter(keep)),
        reviewed: Object.fromEntries(Object.entries(state.reviewed).filter(keep)),
      };
    }),
    saveBasketList: (name) => {
      const title = name.trim().slice(0, 44);
      if (!title || !items.length || lists.length >= 12) return false;
      update((state) => ({
        ...state, lists: [...state.lists, { id: crypto.randomUUID(), name: title, items: Object.fromEntries(items.map(({ product, quantity }) => [product.id, quantity])) }],
      }));
      announce("Shopping list saved on this device.");
      return true;
    },
    deleteList: (id) => update((state) => ({ ...state, lists: state.lists.filter((list) => list.id !== id) })),
  }}>
    {children}
    <div className="toast-region" role="status" aria-live="polite">{message.text && <span className="toast" key={message.sequence}>{message.text}</span>}</div>
  </ShopContext.Provider>;
}

export function useShop() {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error("Missing shop provider");
  return shop;
}
