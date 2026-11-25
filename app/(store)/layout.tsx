import Image from "next/image";
import { Footer, Header, SavedProductsPanel } from "@/components/shop-chrome";
import { ShopProvider } from "@/components/shop-context";
import { getBusinessDetails } from "@/lib/business-server";
import { getDeliverySettings } from "@/lib/delivery-server";
import { getStorefront } from "@/lib/store-server";

export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ products, available, catalogFailed }, contact, delivery] = await Promise.all([
    getStorefront(), getBusinessDetails(), getDeliverySettings(),
  ]);
  return <ShopProvider products={products} available={available} delivery={delivery} whatsapp={contact.whatsapp}>
    <Header/>
    {catalogFailed && <div className="shell inline-notice" role="status">The catalogue is temporarily unavailable. Try again in a moment.</div>}
    <main id="main">{children}</main>
    <Footer contact={contact}/>
    <SavedProductsPanel/>
    {contact.whatsapp && <a className="whatsapp-chat" href={contact.whatsapp} aria-label="Chat with Imperial on WhatsApp" target="_blank" rel="noopener noreferrer">
      <Image src="/whatsapp.svg" width={23} height={23} alt=""/> <span>WhatsApp</span>
    </a>}
  </ShopProvider>;
}
