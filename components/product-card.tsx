"use client";

import Link from "next/link";
import { Boxes, Heart, Plus } from "lucide-react";
import { listedPrice, naira, packLabel, productAvailability, productLimit, sellingUnitLabel, type Product } from "@/lib/commerce";
import { useShop } from "./shop-context";
import { ProductImage } from "./product-image";

export function SaveButton({ product }: { product: Product }) {
  const shop = useShop();
  const saved = shop.saved.includes(product.id);
  return <button className={`icon-button save-button${saved ? " saved" : ""}`} type="button" aria-pressed={saved} aria-label={`${saved ? "Unsave" : "Save"} ${product.name}`} onClick={() => shop.toggleSaved(product.id)}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button>;
}

export function AddButton({ product, quantity }: { product: Product; quantity?: number }) {
  const shop = useShop();
  const inBasket = shop.items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  if (product.price === null) {
    const quote = product.saleUnit === "carton" ? "Request a carton quote" : "Request a quote";
    return <Link className="button add-button" href={`/wholesale?product=${encodeURIComponent(product.id)}`} aria-label={`${quote} for ${product.name}`}>
      <Boxes size={17}/> {quote}
    </Link>;
  }
  const minimum = product.minimumQuantity ?? 1;
  const increment = quantity ?? Math.max(1, minimum - inBasket);
  const limit = productLimit(product);
  const nextQuantity = inBasket + increment;
  const canAdd = increment >= 1 && nextQuantity >= minimum && nextQuantity <= limit;
  const unavailable = limit < minimum ? "Out of stock" : "Limit reached";
  return <button className="button add-button" type="button" disabled={!canAdd} onClick={() => shop.add(product, increment)} aria-label={canAdd ? `Add ${product.name} to basket` : `${product.name}: ${unavailable}`}>
    {canAdd && <Plus size={17}/>}
    {canAdd ? "Add to basket" : unavailable}
  </button>;
}

export function ProductCard({ product }: { product: Product }) {
  const minimum = product.minimumQuantity ?? 1;
  return <article className="product-card">
    <div className="product-card-visual">
      <Link href={`/products/${product.id}`} prefetch={false} aria-label={product.name}><ProductImage product={product} sizes="(max-width: 600px) 47vw, (max-width: 980px) 33vw, 310px" /></Link>
      {product.comparePrice && <span className="product-badge">Good deal</span>}
      <SaveButton product={product}/>
    </div>
    <div className="product-card-copy">
      <p className="product-meta">{product.brand}</p>
      <h3><Link href={`/products/${product.id}`} prefetch={false}>{product.name}</Link></h3>
      <p className="product-meta mb-2">{packLabel(product)}</p>
      {product.price !== null && product.purchaseMode === "wholesale" && <p className="product-meta mb-2">Wholesale</p>}
      {minimum > 1 && <p className="product-meta mb-2">Minimum {minimum} {sellingUnitLabel(product.saleUnit, minimum)}</p>}
      <ProductPrice product={product}/>
      <AddButton product={product}/>
    </div>
  </article>;
}

export function ProductPrice({ product }: { product: Product }) {
  const price = listedPrice(product);
  return <div className="price">{price === null ? <span className="muted text-sm">Price on request</span> : <>
    <strong>{naira(price)}</strong><span className="muted text-sm">{product.price === null ? "Pack size to confirm" : `per ${sellingUnitLabel(product.saleUnit)}`}</span>
    {product.price !== null && product.comparePrice !== null && <del>{naira(product.comparePrice)}</del>}
  </>}</div>;
}

export function ProductAvailability({ product }: { product: Product }) {
  const availability = productAvailability(product);
  const label = availability === "in-stock" ? "In stock" : availability === "out-of-stock" ? "Out of stock" : "Confirm availability by quote";
  return <span className={`inline-flex rounded-md bg-stone-100 px-2.5 py-1 text-sm font-bold ${availability === "in-stock" ? "status-confirmed" : ""}`}>{label}</span>;
}
