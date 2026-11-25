import Link from "next/link";
import type { BusinessDetails } from "@/lib/business";

export function SupportLinks({ business, privacy = false }: { business: BusinessDetails; privacy?: boolean }) {
  const email = privacy ? business.privacyEmail || business.supportEmail : business.supportEmail;
  return <ul>
    {business.whatsapp && <li><a className="text-link" href={business.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp +{business.whatsappNumber.replace(/^\+/, "")}</a></li>}
    {email && <li><a className="text-link" href={`mailto:${email}`}>{email}</a></li>}
    {business.phone && <li><a className="text-link" href={`tel:${business.phone.replace(/[ ()-]/g, "")}`}>Call {business.phone}</a></li>}
    {!business.whatsapp && !email && !business.phone && <li>Visit <Link href="/contact">Contact</Link> for customer service information.</li>}
  </ul>;
}
