"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { estimateDelivery } from "@/lib/delivery-estimate";
import { naira, type Product } from "@/lib/commerce";
import { useShop } from "./shop-context";

export function DeliveryAreaSelect({ required = false }: { required?: boolean }) {
  const { area, setArea, delivery } = useShop();
  return <label className="delivery-area-select">
    Delivery area
    <select name="zone" value={area} required={required} onChange={(event) => {
      const value = event.currentTarget.value;
      setArea(value === "outside-lagos" ? value : delivery.zones.find(({ id }) => id === value)?.id ?? "");
    }}>
      <option value="">Select an area</option>
      {delivery.zones.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      <option value="outside-lagos">Other areas in Nigeria</option>
    </select>
  </label>;
}

export function DeliveryLocation({ product }: { product?: Product }) {
  const { area, delivery, items, subtotal } = useShop();
  const quantity = product?.minimumQuantity ?? 1;
  const lines = product ? [{ product, quantity }] : items;
  const estimate = area && product?.price === null ? { kind: "quote" } as const
    : estimateDelivery(area, product ? (product.price ?? 0) * quantity : subtotal, delivery, lines);
  return <div className="delivery-location">
    <MapPin size={18} aria-hidden="true"/>
    <div>
      <DeliveryAreaSelect/>
      <p className="muted mt-1 text-sm" aria-live="polite">
        {estimate.kind === "priced" && <>{estimate.fee === 0 ? "Free delivery" : naira(estimate.fee)} · Estimated {estimate.time}</>}
        {estimate.kind === "quote" && "Imperial will confirm the delivery fee and timing by quote."}
        {estimate.kind === "minimum" && <>Minimum subtotal for Lagos delivery is {naira(estimate.minimum)}.</>}
        {estimate.kind === "unselected" && "Select your area to check delivery fees and estimates."}
      </p>
      <Link className="text-link mt-1 text-sm" href="/delivery">Delivery details</Link>
    </div>
  </div>;
}
