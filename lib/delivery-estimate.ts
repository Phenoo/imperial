import { deliveryFee, type DeliverySettings, type Product, type ZoneId } from "./commerce.ts";

export type DeliveryArea = ZoneId | "" | "outside-lagos";
export type DeliveryEstimate =
  | { kind: "unselected" }
  | { kind: "minimum"; minimum: number }
  | { kind: "quote" }
  | { kind: "priced"; fee: number; time: string };

type DeliveryLine = {
  product: Pick<Product, "shippingWeightGrams" | "deliveryQuoteOnly">;
  quantity: number;
};

export function estimateDelivery(area: DeliveryArea, subtotal: number, delivery: DeliverySettings, lines: readonly DeliveryLine[]): DeliveryEstimate {
  if (!area) return { kind: "unselected" };
  if (area === "outside-lagos" || lines.some(({ product }) => product.deliveryQuoteOnly)) return { kind: "quote" };
  const limit = delivery.quoteAboveWeightGrams;
  if (limit) {
    const weight = lines.reduce((sum, { product, quantity }) => {
      return product.shippingWeightGrams ? sum + product.shippingWeightGrams * quantity : Infinity;
    }, 0);
    if (weight > limit) return { kind: "quote" };
  }
  const zone = delivery.zones.find(({ id }) => id === area);
  if (!zone) return { kind: "quote" };
  if (delivery.minimumSubtotal && subtotal < delivery.minimumSubtotal) {
    return { kind: "minimum", minimum: delivery.minimumSubtotal };
  }
  return { kind: "priced", fee: deliveryFee(area, subtotal, delivery), time: zone.time };
}
