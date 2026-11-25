import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalEmail = text(150).pipe(z.union([z.email(), z.literal("")]));
const optionalHttps = text(1000).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Enter a valid HTTPS address.");
const optionalPhone = text(26).refine((value) => {
  return !value || (/^\+?[\d ()-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, "")));
}, "Enter a valid public phone number.");

export const businessSchema = z.object({
  tradingName: text(120).min(2),
  registration: text(160).default(""),
  address: text(250).default(""),
  phone: optionalPhone.default(""),
  whatsappNumber: text(14).regex(/^(?:\+?234[789]\d{9})?$/, "Enter the Nigerian WhatsApp number with country code 234 and no spaces.").default(""),
  supportEmail: optionalEmail.default(""),
  privacyEmail: optionalEmail.default(""),
  serviceHours: text(200).default(""),
  instagram: optionalHttps.default(""),
  facebook: optionalHttps.default(""),
  photoUrl: optionalHttps.default(""),
  photoAlt: text(160).default(""),
  mapUrl: optionalHttps.default(""),
  collectionHours: text(200).default(""),
  collectionInstructions: text(500).default(""),
  wholesaleResponse: text(250).default(""),
  refundProcessing: text(250).default(""),
}).superRefine((value, context) => {
  if (value.photoUrl && !value.photoAlt) {
    context.addIssue({ code: "custom", path: ["photoAlt"], message: "Describe the approved business photograph." });
  }
  if (value.mapUrl && !value.address) {
    context.addIssue({ code: "custom", path: ["address"], message: "Enter the approved public address before publishing a map link." });
  }
  if ((value.collectionHours || value.collectionInstructions) && !(value.address && value.collectionHours && value.collectionInstructions)) {
    context.addIssue({ code: "custom", path: ["collectionInstructions"], message: "Collection requires the approved address, hours and instructions." });
  }
});

export type BusinessDetails = z.output<typeof businessSchema> & { whatsapp: string | null };
export type BusinessFields = z.output<typeof businessSchema>;

export const moderationStates = ["pending", "approved", "hidden"] as const;
export const reviewSchema = z.object({
  id: z.uuid(),
  text: text(1200).min(10),
  displayName: text(90).default(""),
  identityPermission: z.boolean().default(false),
  publishPermission: z.boolean().default(false),
  date: z.iso.date(),
  rating: z.number().int().min(1).max(5).nullable(),
  productId: text(80).regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/).default(""),
  photoUrl: optionalHttps.default(""),
  photoAlt: text(160).default(""),
  status: z.enum(moderationStates),
}).superRefine((value, context) => {
  if (value.status !== "approved") return;
  if (!value.publishPermission) context.addIssue({ code: "custom", path: ["publishPermission"], message: "Confirm the customer's permission before publishing their feedback." });
  if ((value.displayName || value.photoUrl) && !value.identityPermission) {
    context.addIssue({ code: "custom", path: ["identityPermission"], message: "Confirm permission to publish the customer name or photo, or leave them blank." });
  }
  if (value.photoUrl && !value.photoAlt) {
    context.addIssue({ code: "custom", path: ["photoAlt"], message: "Describe the approved photograph." });
  }
});
export type ReviewRecord = z.output<typeof reviewSchema>;

export const supportStates = ["open", "in_review", "resolved"] as const;
export const supportCaseSchema = z.object({
  id: z.uuid(),
  reference: text(90).min(2),
  summary: text(500).min(5),
  resolution: text(500).default(""),
  status: z.enum(supportStates),
});
export type SupportCase = z.output<typeof supportCaseSchema>;

export type BusinessDashboard = {
  business: BusinessFields;
  version: string | null;
  reviews: ReviewRecord[];
  supportCases: SupportCase[];
};
