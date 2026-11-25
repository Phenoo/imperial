import { beginOnlineCheckout, onlinePaymentMode, releaseExpiredCheckouts } from "@/lib/bachs";
import { body, handle, json, requireStore } from "@/lib/http";
import { reserveOnlineOrder, StoreError } from "@/lib/store-server";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    requireStore();
    if (!onlinePaymentMode()) throw new StoreError("Online payment is unavailable right now.", 503);
    const input = checkoutSchema.parse(await body(request));
    await releaseExpiredCheckouts();
    const order = await reserveOnlineOrder(input);
    const checkoutUrl = await beginOnlineCheckout(order);
    return json({ id: order.id, checkoutUrl }, 201);
  } catch (error) { return handle(error); }
}
