import type { Metadata } from "next";
import { SharedCatalogue } from "@/components/staff-catalogue";

export const metadata: Metadata = {
  title: "Submit catalogue details",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CatalogueUpdatePage() {
  return <SharedCatalogue/>;
}
