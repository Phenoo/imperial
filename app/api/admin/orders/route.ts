import { after } from "next/server";
import { body, handle, json, requireStaff } from "@/lib/http";
import { sendFulfilmentUpdate } from "@/lib/order-mail";
import { listOrders, updateOrderStatus } from "@/lib/store-server";
import { orderId, orderUpdateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const after = new URL(request.url).searchParams.get("after");
    return json(await listOrders(after ? orderId.parse(after) : undefined));
  } catch (error) { return handle(error); }
}

export async function PATCH(request: Request) {
  try {
    const staff = await requireStaff(request);
    const { id, status } = orderUpdateSchema.parse(await body(request));
    const order = await updateOrderStatus(id, status, staff.uid);
    after(() => sendFulfilmentUpdate(id, status));
    return json({ order });
  } catch (error) { return handle(error); }
}
