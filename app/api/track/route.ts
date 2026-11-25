import { body, handle, json, requireStore } from "@/lib/http";
import { trackOrder } from "@/lib/store-server";
import { trackSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    requireStore();
    const { id, phone, review } = trackSchema.parse(await body(request));
    return json(await trackOrder(id, phone, review));
  } catch (error) { return handle(error); }
}
