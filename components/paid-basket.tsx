"use client";

import { useEffect } from "react";
import { useShop } from "./shop-context";

export function PaidBasket({ id }: { id: string }) {
  const { clear, items } = useShop();
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem("imperial-online-order") ?? "null");
      if (!saved || typeof saved !== "object" || !("id" in saved) || saved.id !== id || !("items" in saved)) return;
      const current = items.map(({ product, quantity }) => ({ productId: product.id, quantity, price: product.price }));
      if (!current.length || JSON.stringify(current) !== JSON.stringify(saved.items)) return;
      sessionStorage.removeItem("imperial-online-order");
      clear();
    } catch { /* Checkout confirmation does not depend on browser storage. */ }
  }, [clear, id, items]);
  return null;
}
