import { body, handle, json, requireStaff } from "@/lib/http";
import { wholesaleId, wholesaleUpdateSchema } from "@/lib/validation";
import { listWholesaleRequests, saveWholesaleQuote, updateWholesaleStatus } from "@/lib/wholesale-server";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const after = new URL(request.url).searchParams.get("after");
    return json(await listWholesaleRequests(after ? wholesaleId.parse(after) : undefined));
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireStaff(request);
    const update = wholesaleUpdateSchema.parse(await body(request));
    const result = "quote" in update
      ? await saveWholesaleQuote(update.id, update.quote, update.previousQuoteAt)
      : await updateWholesaleStatus(update.id, update.status);
    return json({ request: result });
  } catch (error) {
    return handle(error);
  }
}
