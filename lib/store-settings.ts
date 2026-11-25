import "server-only";
import { z } from "zod";
import { defaultDelivery, deliveryZones, type DeliverySettings } from "./commerce";

const zone = z.object({ fee: z.number().int().min(0).max(200000), time: z.string().trim().min(3).max(90) });
export const deliveryConfigurationSchema = z.object({
  freeFrom: z.number().int().min(1).max(10000000),
  minimumSubtotal: z.number().int().min(1).max(10000000).optional(),
  quoteAboveWeightGrams: z.number().int().min(1).max(100000000).optional(),
  island: zone,
  mainland: zone,
  outer: zone,
});
export type DeliveryConfiguration = z.output<typeof deliveryConfigurationSchema>;

const defaultConfiguration: DeliveryConfiguration = {
  freeFrom: defaultDelivery.freeFrom,
  island: { fee: deliveryZones[0].fee, time: deliveryZones[0].time },
  mainland: { fee: deliveryZones[1].fee, time: deliveryZones[1].time },
  outer: { fee: deliveryZones[2].fee, time: deliveryZones[2].time },
};

export function defaultDeliveryConfiguration(): DeliveryConfiguration {
  const source = process.env.STORE_LAGOS_DELIVERY_RULES;
  if (!source) return defaultConfiguration;
  try {
    return deliveryConfigurationSchema.parse(JSON.parse(source));
  } catch {
    throw new Error("STORE_LAGOS_DELIVERY_RULES must contain valid fees and estimates for all three Lagos zones.");
  }
}

export function deliverySettings(configuration = defaultDeliveryConfiguration()): DeliverySettings {
  const { freeFrom, minimumSubtotal, quoteAboveWeightGrams } = configuration;
  return {
    freeFrom, minimumSubtotal, quoteAboveWeightGrams,
    zones: deliveryZones.map((zone) => ({ ...zone, ...configuration[zone.id] })),
  };
}

export function supportContact() {
  const email = z.email().safeParse(process.env.STORE_SUPPORT_EMAIL?.trim());
  const whatsapp = process.env.STORE_SUPPORT_WHATSAPP?.trim();
  return {
    email: email.success ? email.data : null,
    whatsapp: whatsapp && /^234[789]\d{9}$/.test(whatsapp) ? `https://wa.me/${whatsapp}` : null,
  };
}

export function isDemoStore() {
  return process.env.STORE_DEMO_CATALOG === "1";
}

export function isOwnerPreview() {
  return isDemoStore() && process.env.STORE_OWNER_PREVIEW !== "0";
}

export function payOnDeliveryEnabled() {
  return !isDemoStore() || Boolean(process.env.FIREBASE_PROJECT_ID?.startsWith("demo-"));
}
