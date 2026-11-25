import { body, handle, json, requireStore } from "@/lib/http";
import { after } from "next/server";
import { sendOrderReceipt } from "@/lib/order-mail";
import { payOnDeliveryEnabled } from "@/lib/store-settings";
import { placeOrder } from "@/lib/store-server";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    requireStore();
    if (!payOnDeliveryEnabled()) return json({ error: "This storefront preview only accepts test payments." }, 503);
    const order = await placeOrder(checkoutSchema.parse(await body(request)));
    after(() => sendOrderReceipt(order.id));
    return json(order, 201);
  } catch (error) { return handle(error); }
}
