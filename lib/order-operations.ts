import type { Order, OrderLine, OrderStatus, OrderSummary, Product } from "./commerce";

export const fulfilmentStatusLabel: Record<OrderStatus, string> = {
  placed: "Order received",
  confirmed: "Being prepared",
  out_for_delivery: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function orderOperationsMode(order: Pick<Order, "simulated" | "payment">, demoEnvironment = false) {
  if (order.simulated === true || (order.simulated === undefined && demoEnvironment)) return "simulated";
  if (order.simulated === undefined && order.payment) return "unconfirmed";
  return "normal";
}

export function reliableFulfilment(order: Pick<Order, "simulated" | "payment">, demoEnvironment = false) {
  return orderOperationsMode(order, demoEnvironment) === "normal";
}

export type ReorderLine = { original: OrderLine; current: Product | null };
export type TrackingResult = OrderSummary & {
  mode: ReturnType<typeof orderOperationsMode>;
  events: { status: OrderStatus; at?: string }[];
  reorder?: ReorderLine[];
};
