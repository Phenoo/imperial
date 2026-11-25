import type { Metadata } from "next";
import { canonicalStoreUrl } from "@/lib/site-url";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";

const origin = canonicalStoreUrl();
export const metadata: Metadata = {
  title: { default: "Imperial Foods & Beverages | The World in Your Pantry", template: "%s | Imperial Foods & Beverages" },
  description: "Shop imported basmati rice, tinned fish, Indonesian noodles and pantry favourites with delivery across Nigeria.",
  icons: { icon: "/icon.svg" },
  ...(origin && { metadataBase: new URL(origin) }),
  ...(process.env.STORE_DEMO_CATALOG === "1" && { robots: { index: false, follow: false } }),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-NG"><body>{children}</body></html>;
}
