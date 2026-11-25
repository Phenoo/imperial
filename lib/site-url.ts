import "server-only";

export function storeUrl() {
  const value = process.env.STORE_URL || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return url.origin;
  } catch { /* Treat an invalid value as missing configuration. */ }
  return null;
}

export function canonicalStoreUrl() {
  const configured = process.env.STORE_PUBLIC_URL || process.env.STORE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (configured) {
    try {
      const url = new URL(configured);
      if (!url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) return url.origin;
    } catch { /* Use the existing origin when the optional public URL is invalid. */ }
  }
  return storeUrl();
}

export function canonicalMetadata(path: string) {
  const origin = canonicalStoreUrl();
  return origin ? { alternates: { canonical: new URL(path, origin).href } } : {};
}
