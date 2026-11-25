import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ApprovedReviews } from "@/components/approved-reviews";
import { DeliveryLocation } from "@/components/delivery-location";
import { ProductAvailability, ProductCard, ProductPrice } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { ProductEnquiry, ProductViewEvent } from "@/components/product-enquiry";
import { ProductPurchase } from "@/components/product-purchase";
import { categoryName, foodInfoFields, packLabel, productAvailability, type Product } from "@/lib/commerce";
import { hamperOffers } from "@/lib/hamper-offers";
import { getBusinessDetails } from "@/lib/business-server";
import { getStorefront } from "@/lib/store-server";
import { canonicalMetadata, canonicalStoreUrl } from "@/lib/site-url";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, { products }] = await Promise.all([params, getStorefront()]);
  const product = products.find((entry) => entry.id === slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name, description: product.description,
    openGraph: { title: product.name, description: product.description, images: [{ url: product.image, alt: product.name }] },
    ...canonicalMetadata(`/products/${product.id}`),
  };
}

function ProductInformation({ product }: { product: Product }) {
  const foodInformation = Object.entries(foodInfoFields).flatMap(([field, label]) => {
    const value = product.food?.[field as keyof typeof foodInfoFields];
    return value ? [{ field, label, value }] : [];
  });
  return <section className="form-card home-section" aria-labelledby="food-information">
    <h2 id="food-information">Food and pack information</h2>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="font-bold">SKU</dt><dd>{product.sku ?? product.id}</dd></div>
      <div><dt className="font-bold">Selling unit</dt><dd>{packLabel(product)}</dd></div>
      {foodInformation.map(({ field, label, value }) => <div key={field}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-line">{value}</dd></div>)}
    </dl>
    {(!product.food?.shelfLife || !product.food?.allergens || !product.food?.ingredients) && <p className="mt-4 muted text-sm">
      Need current best-before dates or label details? <Link className="text-link" href="/contact">Ask our team</Link>.
    </p>}
    {Boolean(product.labelImages?.length) && <>
      <h3 className="mt-5 text-lg font-bold">Packaging and label photos</h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {product.labelImages?.map((source, index) => <li key={source}>
          <a className="block" href={source} target="_blank" rel="noopener noreferrer">
            <div className="product-image"><Image src={source} fill unoptimized sizes="(max-width: 600px) 45vw, 32vw"
              alt={`${product.name} label photo ${index + 1}`} referrerPolicy="no-referrer"/></div>
            <span className="text-link mt-1">View label photo {index + 1}</span>
          </a>
        </li>)}
      </ul>
    </>}
  </section>;
}

export default async function ProductPage({ params }: Props) {
  const [{ slug }, { products, available }, { whatsapp }] = await Promise.all([params, getStorefront(), getBusinessDetails()]);
  const product = products.find((entry) => entry.id === slug);
  if (!product) notFound();
  const hamper = hamperOffers.find((offer) => offer.id === product.id);
  const contents = product.bundleContents ?? hamper?.contents;
  const variants = product.variantGroup ? products.filter((entry) => entry.variantGroup === product.variantGroup && entry.brand === product.brand && entry.category === product.category) : [];
  const related = products.filter((entry) => entry.id !== product.id && entry.category === product.category).slice(0, 4);
  const size = packLabel(product);
  const url = canonicalStoreUrl();
  const canonicalUrl = url ? new URL(`/products/${product.id}`, url).href : null;
  const structured = url && available && process.env.STORE_DEMO_CATALOG !== "1" && product.price !== null ? {
    "@context": "https://schema.org", "@type": "Product", sku: product.sku ?? product.id, name: product.name, description: product.description,
    image: new URL(product.image, url).href, brand: { "@type": "Brand", name: product.brand },
    offers: { "@type": "Offer", url: new URL(`/products/${product.id}`, url).href, priceCurrency: "NGN", price: product.price,
      availability: productAvailability(product) === "in-stock" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  } : null;
  return <div className="shell subpage">
    <ProductViewEvent productId={product.id}/>
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}/>}
    <nav aria-label="Breadcrumb" className="breadcrumbs"><Link href="/">Home</Link><ChevronRight size={14}/><Link href={`/shop?category=${product.category}`}>{categoryName(product.category)}</Link><ChevronRight size={14}/><span>{product.brand}</span></nav>
    <section className="product-detail">
      <ProductImage product={product} sizes="(max-width: 700px) 90vw, 46vw" priority/>
      <div>
        <span className="eyebrow">{[product.brand, product.origin].filter(Boolean).join(" · ")}</span>
        <h1>{product.name}</h1>
        <p className="product-size">{size}</p>
        <ProductPrice product={product}/>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ProductAvailability product={product}/>
          {product.price !== null && product.purchaseMode === "wholesale" && <span className="muted text-sm">Wholesale</span>}
        </div>
        {variants.length > 1 && <nav className="mt-4" aria-label="Choose size or pack">
          <p className="mb-2 text-sm font-bold">Choose size or pack</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => <Link className={`button ${variant.id === product.id ? "button-green" : "button-outline"}`}
              key={variant.id} href={`/products/${variant.id}`} aria-current={variant.id === product.id ? "page" : undefined}>{packLabel(variant)}</Link>)}
          </div>
        </nav>}
        <p className="product-description">{product.description}</p>
        {Boolean(contents?.length) && <div className="hamper-contents">
          <h2>What’s inside</h2>
          <ul>{contents?.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
        </div>}
        <ProductPurchase key={product.id} product={product}/>
        {product.price !== null && (
          <Link className="text-link mt-4" href={`/wholesale?product=${encodeURIComponent(product.id)}`}>Request a carton or wholesale quote <ChevronRight size={16}/></Link>
        )}
        {whatsapp && <div className="mt-4">
          <ProductEnquiry whatsapp={whatsapp} productId={product.id} name={product.name} specification={size} canonicalUrl={canonicalUrl}/>
        </div>}
        <DeliveryLocation product={product}/>
      </div>
    </section>
    <ProductInformation product={product}/>
    <Suspense fallback={null}><ApprovedReviews productId={product.id}/></Suspense>
    {related.length > 0 && <section className="home-section"><div className="section-heading"><div><span className="eyebrow">IN THE SAME CATEGORY</span><h2>More to explore</h2></div></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item}/>)}</div></section>}
  </div>;
}
