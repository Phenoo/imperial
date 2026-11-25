import type { Metadata } from "next";
import { canonicalStoreUrl } from "@/lib/site-url";
import { searchIndexingEnabled } from "@/lib/search-indexing";
import { SiteAnalytics } from "@/components/site-analytics";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";

const origin = canonicalStoreUrl();
export const metadata: Metadata = {
  title: { default: "Imperial Foods & Beverages | The World in Your Pantry", template: "%s | Imperial Foods & Beverages" },
  description: "Shop imported basmati rice, tinned fish, Indonesian noodles and pantry favourites with delivery across Nigeria.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website", locale: "en_NG", siteName: "Imperial Foods & Beverages",
    title: "Imperial Foods & Beverages", description: "Imported rice, tinned foods and groceries for retail and wholesale customers across Nigeria.",
    images: [{ url: "/images/hero-rice.webp", alt: "Basmati rice at Imperial Foods & Beverages" }],
  },
  twitter: { card: "summary_large_image" },
  ...(origin && { metadataBase: new URL(origin) }),
  ...(process.env.GOOGLE_SITE_VERIFICATION && { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }),
  ...(!searchIndexingEnabled() && { robots: { index: false, follow: false } }),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NG"><body>{children}<SiteAnalytics id={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} mode={process.env.STORE_DEMO_CATALOG === "1" || process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") ? "sandbox" : "live"}/></body></html>;
}
