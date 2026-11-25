import { z } from "zod";
import { body, handle, json, requireStaff } from "@/lib/http";
import { listInventoryEvents, listProducts, saveProduct, updateBulkPricing } from "@/lib/store-server";
import { bulkPricingSchema, productSchema } from "@/lib/validation";
import { invalidatePublicStore } from "@/lib/public-store-cache";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    const [products, inventoryEvents] = await Promise.all([listProducts(), listInventoryEvents()]);
    return json({ products, inventoryEvents });
  } catch (error) { return handle(error); }
}

export async function PUT(request: Request) {
  try {
    const { uid } = await requireStaff(request);
    const { product, version } = z.object({ product: productSchema, version: z.string().max(40).nullable() }).parse(await body(request));
    await saveProduct(product, version, uid);
    invalidatePublicStore("catalogue");
    return json({ saved: true });
  } catch (error) { return handle(error); }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await requireStaff(request);
    const rows = bulkPricingSchema.parse(await body(request));
    await updateBulkPricing(rows, uid);
    invalidatePublicStore("catalogue");
    return json({ updated: rows.length });
  } catch (error) { return handle(error); }
}
