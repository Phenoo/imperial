import { body, handle, json, requireStaff } from "@/lib/http";
import { listProducts, updateCatalogue } from "@/lib/store-server";
import { catalogueUpdateSchema } from "@/lib/validation";
import { invalidatePublicStore } from "@/lib/public-store-cache";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    return json({ products: await listProducts() });
  } catch (error) { return handle(error); }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await requireStaff(request);
    const { updates } = catalogueUpdateSchema.parse(await body(request, 96 * 1024));
    const products = await updateCatalogue(updates, uid);
    invalidatePublicStore("catalogue");
    return json({ products });
  } catch (error) { return handle(error); }
}
