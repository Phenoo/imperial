import { body, handle, json, requireStore } from "@/lib/http";
import { wholesaleInquirySchema } from "@/lib/validation";
import { submitWholesaleRequest } from "@/lib/wholesale-server";

export async function POST(request: Request) {
  try {
    requireStore("Wholesale requests are temporarily unavailable.");
    const inquiry = wholesaleInquirySchema.parse(await body(request));
    return json(await submitWholesaleRequest(inquiry), 201);
  } catch (error) {
    return handle(error);
  }
}
