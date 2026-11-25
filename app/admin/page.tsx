import type { Metadata } from "next";
import { Admin } from "@/components/admin";
import { isDemoStore } from "@/lib/store-settings";

export const metadata: Metadata = { title: "Staff dashboard", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <Admin demoEnvironment={isDemoStore()}/>;
}
