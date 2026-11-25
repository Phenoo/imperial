import { z } from "zod";
import { getDeliveryConfiguration, saveDeliveryConfiguration } from "@/lib/delivery-server";
import { deliveryConfigurationSchema } from "@/lib/store-settings";
import { body, handle, json, requireStaff } from "@/lib/http";
import { invalidatePublicStore } from "@/lib/public-store-cache";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    return json(await getDeliveryConfiguration());
  } catch (error) {
    return handle(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { uid } = await requireStaff(request);
    const { configuration, version } = z.object({
      configuration: deliveryConfigurationSchema,
      version: z.string().max(40).nullable(),
    }).parse(await body(request));
    const saved = await saveDeliveryConfiguration(configuration, version, uid);
    if (saved) invalidatePublicStore("delivery");
    return saved ? json(saved) : json({ error: "Delivery settings changed. Reload them before saving again." }, 409);
  } catch (error) {
    return handle(error);
  }
}
