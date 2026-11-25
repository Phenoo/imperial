import { after } from "next/server";
import { reconcileOnlineOrder } from "@/lib/payments";
import { body, handle, json, requireStaff } from "@/lib/http";
import { sendOrderReceipt } from "@/lib/order-mail";
import { findOnlineOrder, StoreError } from "@/lib/store-server";
import { orderId } from "@/lib/validation";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    await requireStaff(request);
    const { id } = z.object({ id: orderId }).parse(await body(request));
    const order = await findOnlineOrder(id);
    if (!order) throw new StoreError("No online payment was found for this order.", 404);
    const updated = await reconcileOnlineOrder(order);
    if (updated.payment?.status === "paid") after(() => sendOrderReceipt(id));
    return json({ order: updated });
  } catch (error) { return handle(error); }
}
