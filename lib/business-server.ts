import "server-only";
import { cache } from "react";
import { z } from "zod";
import {
  businessSchema, reviewSchema, supportCaseSchema,
  type BusinessDashboard, type BusinessDetails, type BusinessFields, type ReviewRecord, type SupportCase,
} from "./business";
import { database, firebaseProjectId } from "./firebase-server";
import { StoreError } from "./store-server";
import { supportContact } from "./store-settings";
import { cachedPublicStoreRead } from "./public-store-cache";

function defaultBusiness() {
  const contact = supportContact();
  return businessSchema.parse({
    tradingName: "Imperial Foods & Beverages",
    whatsappNumber: contact.whatsapp?.split("/").at(-1) ?? "",
    supportEmail: contact.email ?? "",
    privacyEmail: z.email().safeParse(process.env.STORE_PRIVACY_EMAIL?.trim()).data ?? "",
  });
}

function readBusiness(value: unknown): BusinessFields {
  const defaults = defaultBusiness();
  const stored = businessSchema.safeParse(value);
  return stored.success ? {
    ...stored.data,
    whatsappNumber: stored.data.whatsappNumber || defaults.whatsappNumber,
    supportEmail: stored.data.supportEmail || defaults.supportEmail,
    privacyEmail: stored.data.privacyEmail || defaults.privacyEmail,
  } : defaults;
}

function settingsRef() {
  return database().collection("storeSettings").doc("publicBusiness");
}

function version(snapshot: FirebaseFirestore.DocumentSnapshot) {
  return snapshot.updateTime ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : null;
}

const readPublicBusiness = cachedPublicStoreRead("business", async () => readBusiness((await settingsRef().get()).data()), defaultBusiness);
export const getBusinessDetails = cache(async (): Promise<BusinessDetails> => {
  const business = firebaseProjectId() ? await readPublicBusiness() : defaultBusiness();
  return {
    ...business,
    whatsapp: business.whatsappNumber ? `https://wa.me/${business.whatsappNumber.replace(/^\+/, "")}` : null,
  };
});

export async function loadBusinessDashboard(): Promise<BusinessDashboard> {
  const db = database();
  const [settings, reviews, supportCases] = await Promise.all([
    settingsRef().get(),
    db.collection("customerReviews").orderBy("updatedAt", "desc").limit(50).get(),
    db.collection("supportCases").orderBy("updatedAt", "desc").limit(50).get(),
  ]);
  return {
    business: readBusiness(settings.data()),
    version: version(settings),
    reviews: reviews.docs.map((record) => reviewSchema.parse(record.data())),
    supportCases: supportCases.docs.map((record) => supportCaseSchema.parse(record.data())),
  };
}

export async function saveBusinessDetails(value: BusinessFields, expectedVersion: string | null) {
  const reference = settingsRef();
  await database().runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (version(existing) !== expectedVersion) throw new StoreError("Business details were changed in another session. Reload the panel before saving.", 409);
    transaction.set(reference, { ...value, updatedAt: new Date().toISOString() });
  });
  const updated = await reference.get();
  return { business: readBusiness(updated.data()), version: version(updated) };
}

export async function saveReview(review: ReviewRecord) {
  const db = database();
  if (review.date > new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date())) {
    throw new StoreError("Enter the date you received the feedback.", 400);
  }
  if (review.productId && !(await db.collection("products").doc(review.productId).get()).exists) {
    throw new StoreError("Enter a product ID from the catalogue.", 400);
  }
  await db.collection("customerReviews").doc(review.id).set({ ...review, updatedAt: new Date().toISOString() });
  return review;
}

export async function saveSupportCase(supportCase: SupportCase) {
  await database().collection("supportCases").doc(supportCase.id).set({ ...supportCase, updatedAt: new Date().toISOString() });
  return supportCase;
}

const readPublicReviews = cachedPublicStoreRead("reviews", async () => {
  const snapshot = await database().collection("customerReviews").where("status", "==", "approved").get();
  return snapshot.docs.flatMap((record) => {
    const { data } = reviewSchema.safeParse(record.data());
    if (!data?.publishPermission) return [];
    const { id, text, date, rating, displayName, photoUrl, photoAlt, identityPermission, productId } = data;
    return [{
      id, text, date, rating, productId,
      displayName: identityPermission ? displayName : "",
      photoUrl: identityPermission ? photoUrl : "",
      photoAlt: identityPermission ? photoAlt : "",
    }];
  }).sort((first, second) => second.date.localeCompare(first.date));
}, () => []);

export const getApprovedReviews = cache(async (productId?: string) => {
  if (!firebaseProjectId()) return [];
  return (await readPublicReviews()).filter((review) => !productId || review.productId === productId).slice(0, 6);
});
