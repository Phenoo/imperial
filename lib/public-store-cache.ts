import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

export type PublicStoreSection = "catalogue" | "business" | "delivery" | "reviews";

function usesPublicCache() {
  return Boolean(process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID.startsWith("demo-") &&
    !process.env.FIRESTORE_EMULATOR_HOST);
}

function cacheTag(section: PublicStoreSection) {
  return `imperial-public-${section}-${process.env.FIREBASE_PROJECT_ID ?? "local"}`;
}

export async function publicReadDeadline<T>(operation: Promise<T>, milliseconds = 2500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Public store read timed out.")), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function cachedPublicStoreRead<T>(section: PublicStoreSection, read: () => Promise<T>, fallback: () => T) {
  const load = async () => {
    try {
      return await publicReadDeadline(read());
    } catch (error) {
      console.error(`Public ${section} unavailable`, error instanceof Error ? error.message : "Database read failed.");
      return fallback();
    }
  };
  const cached = unstable_cache(load, [cacheTag(section)], { tags: [cacheTag(section)], revalidate: 300 });
  return () => usesPublicCache() ? cached() : load();
}

export function invalidatePublicStore(section: PublicStoreSection) {
  if (usesPublicCache()) revalidateTag(cacheTag(section), { expire: 0 });
}
