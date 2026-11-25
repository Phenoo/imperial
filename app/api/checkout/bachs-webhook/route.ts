import { after } from "next/server";
import { receiveBachsWebhook } from "@/lib/bachs";
import { handle, json } from "@/lib/http";
import { sendOrderReceipt } from "@/lib/order-mail";
import { StoreError } from "@/lib/store-server";

const maxWebhookBytes = 256 * 1024;

export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new StoreError("The webhook body is missing.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxWebhookBytes) {
        await reader.cancel();
        throw new StoreError("The webhook body is too large.", 413);
      }
      chunks.push(chunk.value);
    }
    const order = await receiveBachsWebhook(Buffer.concat(chunks), request.headers);
    if (order?.payment?.status === "paid") after(() => sendOrderReceipt(order.id));
    return json({ received: true });
  } catch (error) { return handle(error); }
}
