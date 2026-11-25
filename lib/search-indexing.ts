import "server-only";

export function searchIndexingEnabled() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  return process.env.STORE_SEARCH_INDEXING === "1" || process.env.STORE_DEMO_CATALOG !== "1";
}
