import type { Metadata } from "next";
import { Admin } from "@/components/admin";
import { isDemoStore } from "@/lib/store-settings";

export const metadata: Metadata = { title: "Update catalogue", robots: { index: false, follow: false } };

export default function CataloguePage() {
  return <Admin demoEnvironment={isDemoStore()} view="catalogue"/>;
}
