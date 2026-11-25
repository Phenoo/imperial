export const shopEvents = [
  "product_view", "search", "search_no_results", "filter_apply", "basket_add", "basket_remove",
  "checkout_start", "delivery_area_selected", "wholesale_request_stored", "delivery_quote_click",
  "product_enquiry_click", "reorder_added",
] as const;

export type ShopEvent = typeof shopEvents[number];

export function recordShopEvent(event: ShopEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("imperial:shop-event", { detail: { event } }));
  if (process.env.NEXT_PUBLIC_STORE_ANALYTICS !== "1") return;
  void fetch("/api/shop-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {});
}
