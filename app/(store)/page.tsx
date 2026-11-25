import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Boxes, CreditCard, Truck } from "lucide-react";
import { BrandMarquee } from "@/components/brand-marquee";
import { ProductGrid } from "@/components/catalog-view";
import { ApprovedReviews } from "@/components/approved-reviews";
import { onlinePaymentMode } from "@/lib/bachs";
import { getBusinessDetails } from "@/lib/business-server";
import { categories } from "@/lib/commerce";
import { canonicalMetadata } from "@/lib/site-url";
import { getStorefront } from "@/lib/store-server";
import { payOnDeliveryEnabled } from "@/lib/store-settings";

export const metadata = canonicalMetadata("/");

const marqueeBrands = [
  { name: "Tilda", image: "/images/brands/tilda.svg" },
  { name: "India Gate", image: "/images/brands/india-gate.png" },
  { name: "Indomie", image: "/images/brands/indomie.png" },
  { name: "Tropical Sun", image: "/images/brands/tropical-sun.webp" },
  { name: "Heinz", image: "/images/brands/heinz.png" },
] as const;

const heroShelves = [
  {
    id: "bags",
    title: "Rice bags",
    productIds: ["india-gate-feast-rozzana", "tropical-sun-golden-sella", "royal-palace-basmati-5kg"],
  },
  {
    id: "cartons",
    title: "Wholesale cartons",
    productIds: ["all-day-sardines", "aeroplane-la-taste-sella-basmati", "amicheck-whole-mushrooms"],
  },
] as const;

export default async function HomePage() {
  const [{ products }, { whatsapp }] = await Promise.all([getStorefront(), getBusinessDetails()]);
  const payOnDelivery = payOnDeliveryEnabled();
  const testCheckout = onlinePaymentMode() === "sandbox";
  const brandsInCatalogue = new Set(products.map((product) => product.brand));
  const brands = marqueeBrands.filter(({ name }) => brandsInCatalogue.has(name));
  const testimonialMessage = "Hello Imperial, I’d like to share a testimonial.\n\nWhat I ordered:\nMy experience:";
  const shelves = heroShelves.map((shelf) => ({
    ...shelf,
    items: shelf.productIds.flatMap((id) => {
      const product = products.find((entry) => entry.id === id);
      return product ? [product] : [];
    }),
  })).filter((shelf) => shelf.items.length > 0);

  return <div className="homepage">
    <div className="shell">
      <section className={shelves.length ? "hero hero-with-products" : "hero"} aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Imported rice.<br/><em>Groceries by the carton.</em></h1>
          <p>Browse imported groceries for home. For shops, caterers and bulk orders, request a wholesale quote.</p>
          <div className="hero-actions flex flex-wrap gap-3">
            <Link href="/shop" className="button button-gold">Shop Groceries</Link>
            <Link href="/wholesale" className="button button-wholesale">Buy Wholesale</Link>
          </div>
        </div>
        {shelves.length > 0 && <div className="hero-products">
          {shelves.map((shelf) => <section key={shelf.id} className="hero-shelf" data-format={shelf.id} aria-labelledby={`hero-${shelf.id}`}>
            <h2 id={`hero-${shelf.id}`}>{shelf.title}</h2>
            <ul>
              {shelf.items.map((product) => <li key={product.id}>
                <Link href={`/products/${product.id}`} aria-label={product.name} className="hero-pack">
                  <span className="hero-pack-photo"><Image src={product.image} alt="" fill unoptimized loading="eager"/></span>
                  <span>{product.brand}</span>
                </Link>
              </li>)}
            </ul>
          </section>)}
        </div>}
      </section>

      <section className="benefits" aria-label="Why shop Imperial">
        <div><span className="benefit-icon"><Boxes size={22}/></span><span><strong><Link href="/wholesale">Carton sales &amp; wholesale</Link></strong><small>Request a quote for bulk orders</small></span></div>
        <div><span className="benefit-icon"><Truck size={22}/></span><span><strong><Link href="/delivery">Delivery across Nigeria</Link></strong><small>See Lagos rates or request a quote</small></span></div>
        <div><span className="benefit-icon"><CreditCard size={22}/></span><span>
          <strong>{testCheckout ? "Test online checkout" : payOnDelivery ? "Pay on delivery" : <Link href="/track">Order tracking</Link>}</strong>
          <small>{testCheckout ? "Online payments are simulated" : payOnDelivery ? "Pay when your groceries arrive" : "Check recorded order updates"}</small>
        </span></div>
      </section>
    </div>

    {brands.length > 0 && <BrandMarquee brands={brands}/>}

    <div className="shell">
      <section id="aisles" className="home-section" aria-labelledby="category-title">
        <div className="section-heading">
          <div>
            <h2 id="category-title">Shop by category</h2>
            <p>Browse rice, tinned foods, noodles, drinks, snacks and more.</p>
          </div>
          <Link href="/shop" className="section-link">View all categories <ArrowRight size={18}/></Link>
        </div>
        <div className="aisle-grid">
          {categories.map(({ id, name, image, color, note }) => <Link key={id} href={`/shop?category=${id}`} className="aisle-card" style={{ backgroundColor: color }}>
            <Image src={image} alt="" fill sizes="(max-width: 600px) 44vw, (max-width: 900px) 32vw, 260px"/>
            <div className="aisle-text"><strong>{name}</strong><small>{note}</small></div>
            <span className="aisle-arrow"><ArrowRight size={17} /></span>
          </Link>)}
        </div>
      </section>

      {products.length > 0 && <section className="home-section" aria-labelledby="product-grid-title">
        <div className="section-heading">
          <div className="grid w-full items-center gap-x-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <h2 id="product-grid-title">Browse products</h2>
            <Link href="/shop" aria-label="Shop all products" className="button button-green mt-3 w-fit sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0">
              Shop all <ArrowRight size={18} aria-hidden="true"/>
            </Link>
            <p className="sm:col-start-1 sm:row-start-2">Check pack sizes and prices, or request a carton quote for wholesale items.</p>
          </div>
        </div>
        <ProductGrid products={products.slice(0, 16)}/>
      </section>}

      <ApprovedReviews/>
      {whatsapp && <section id="testimonials" aria-labelledby="testimonial-title" className="home-section flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-7">
        <div>
          <h2 id="testimonial-title" className="text-xl font-extrabold sm:text-2xl">Share a testimonial</h2>
          <p className="muted mt-1">Tell us what you ordered and how it went.</p>
        </div>
        <a href={`${whatsapp}?text=${encodeURIComponent(testimonialMessage)}`} target="_blank" rel="noopener noreferrer" className="button button-outline">
          Share on WhatsApp <ArrowRight size={18} aria-hidden="true"/>
        </a>
      </section>}
    </div>
  </div>;
}
