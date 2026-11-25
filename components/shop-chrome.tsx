"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Clock3, Heart, MapPin, Menu, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { categories, naira, packLabel, productLimit, sellingUnitLabel } from "@/lib/commerce";
import { recordShopEvent } from "@/lib/shop-analytics";
import { BasketReview } from "./basket-review";
import { Brand } from "./brand";
import { ProductImage } from "./product-image";
import { DeliveryLocation } from "./delivery-location";
import { ProductSearch } from "./product-search";
import { SaveBasketList, ShoppingLists } from "./shopping-lists";
import { useShop } from "./shop-context";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export function Header() {
  const { saved, setPanel } = useShop();
  const [menu, setMenu] = useState(false);

  const closeMenu = () => setMenu(false);

  return <header className="store-header">
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="header-surface">
      <div className="shell header-main">
        <div className="header-brand">
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetTrigger className="icon-button header-menu" aria-label="Browse categories"><Menu size={23} aria-hidden="true"/></SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Shop by category</SheetTitle>
                <SheetDescription className="sr-only">Browse categories, find wholesale, or track an order.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Shop categories" className="sheet-nav panel-links">
                <Link href="/shop" onNavigate={closeMenu}>All categories <ChevronRight size={18}/></Link>
                {categories.map((category) => <Link key={category.id} href={`/shop?category=${category.id}`} onNavigate={closeMenu}>{category.name} <ChevronRight size={18}/></Link>)}
                <Link href="/wholesale" onNavigate={closeMenu}>Wholesale <ChevronRight size={18}/></Link>
                <Link href="/track" onNavigate={closeMenu}>Track order <ChevronRight size={18}/></Link>
                <Link href="/contact" onNavigate={closeMenu}>Contact <ChevronRight size={18}/></Link>
              </nav>
            </SheetContent>
          </Sheet>
          <Brand />
        </div>
        <ProductSearch/>
        <div className="header-actions">
          <Link className="header-action location-link" href="/delivery" aria-label="Delivery areas and estimates"><MapPin size={17} aria-hidden="true"/> <span>Delivery</span></Link>
          <button className="header-action" type="button" aria-label={`Saved products, ${saved.length} items`} onClick={() => setPanel("saved")}><Heart size={21} /><span>Saved</span></button>
          <CartSheet/>
        </div>
      </div>
    </div>
  </header>;
}

function Panel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog className="drawer" ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="drawer-content">
      <div className="drawer-title"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Close panel" onClick={onClose}><X size={23} /></button></div>
      <div className="drawer-body">{children}</div>
    </div>
  </dialog>;
}

export function Quantity({ quantity, min = 1, max, onChange, label }: { quantity: number; min?: number; max: number; onChange: (value: number) => void; label: string }) {
  return <div className="quantity" role="group" aria-label={`Quantity for ${label}`}>
    <button type="button" aria-label={`Decrease ${label} quantity`} disabled={quantity <= min} onClick={() => onChange(quantity - 1)}><Minus size={15}/></button>
    <span>{quantity}</span>
    <button type="button" aria-label={`Increase ${label} quantity`} disabled={quantity >= max || max < min} onClick={() => onChange(Math.max(min, quantity + 1))}><Plus size={15}/></button>
  </div>;
}

export function SavedProductsPanel() {
  const shop = useShop();
  if (shop.panel !== "saved") return null;
  const close = () => shop.setPanel(null);
  const savedProducts = shop.catalog.filter((product) => shop.saved.includes(product.id));
  return <Panel title="Your saved products" onClose={close}>
    <ShoppingLists/>
    {!savedProducts.length && <div className="empty-state"><Heart size={32}/><h3>Save products for later</h3><p>Tap the heart on any product to keep it here.</p><Link className="button button-green" href="/shop" onClick={close}>Explore the shop <ArrowRight size={17}/></Link></div>}
    {savedProducts.map((product) => <div className="drawer-line" key={product.id}>
      <ProductImage product={product} sizes="72px" />
      <div><Link onClick={close} href={`/products/${product.id}`}>{product.name}</Link><p>{[packLabel(product), product.price === null ? "Price on request" : naira(product.price)].filter(Boolean).join(" · ")}</p>
        {product.price === null
          ? <Link className="text-link" href={`/wholesale?product=${encodeURIComponent(product.id)}`} onClick={close}>Request a carton quote</Link>
          : <button className="text-link" disabled={(shop.items.find((item) => item.product.id === product.id)?.quantity ?? 0) + (product.minimumQuantity ?? 1) > productLimit(product)} onClick={() => shop.add(product)} type="button">Add to basket</button>}
      </div>
      <button className="icon-button" type="button" aria-label={`Remove ${product.name} from saved products`} onClick={() => shop.toggleSaved(product.id)}><X size={18}/></button>
    </div>)}
  </Panel>;
}

function CartSheet() {
  const shop = useShop();
  const close = () => shop.setPanel(null);
  return <Sheet open={shop.panel === "cart"} onOpenChange={(open) => shop.setPanel(open ? "cart" : null)}>
    <SheetTrigger className="header-action basket-button" aria-label={`Basket, ${shop.count} items`}><ShoppingBag size={20} aria-hidden="true"/><span>Basket</span><b>{shop.count}</b></SheetTrigger>
    <SheetContent side="right" className="cart-sheet" closeLabel="Close basket">
      <SheetHeader>
        <SheetTitle>Your basket ({shop.count})</SheetTitle>
        <SheetDescription className="sr-only">Review your items, update quantities, or go to checkout.</SheetDescription>
      </SheetHeader>
      <div className="drawer-body">
        <BasketReview/>
        {shop.items.length === 0 && <div className="empty-state"><ShoppingBag size={34}/><h3>Your basket is empty</h3><p>Find a few good things for your pantry.</p><Link className="button button-green" href="/shop" onNavigate={close}>Start shopping <ArrowRight size={17}/></Link></div>}
        {shop.items.map(({ product, quantity }) => <div className="drawer-line" key={product.id}>
          <ProductImage product={product} sizes="72px" />
          <div><Link onNavigate={close} href={`/products/${product.id}`}>{product.name}</Link><p>{packLabel(product)} · {naira(product.price)} per {sellingUnitLabel(product.saleUnit)}</p>
            <Quantity quantity={quantity} min={product.minimumQuantity ?? 1} max={productLimit(product)} onChange={(value) => shop.setQuantity(product, value)} label={product.name} />
            {quantity > product.stock && <small className="form-error">Only {product.stock} in stock.</small>}
            {quantity < (product.minimumQuantity ?? 1) && <small className="form-error">Minimum {product.minimumQuantity} {sellingUnitLabel(product.saleUnit, product.minimumQuantity)}.</small>}
            <p><strong>{naira(quantity * product.price)}</strong></p>
          </div>
          <button className="icon-button" type="button" aria-label={`Remove ${product.name} from basket`} onClick={() => shop.setQuantity(product, 0)}><X size={18}/></button>
        </div>)}
        {shop.items.length > 0 && <><DeliveryLocation/><SaveBasketList/></>}
      </div>
      {shop.items.length > 0 && <div className="drawer-footer">
        <div className="summary-line"><span>Subtotal</span><strong>{naira(shop.subtotal)}</strong></div>
        <Link href="/checkout" className="button button-green" onNavigate={() => { recordShopEvent("checkout_start"); close(); }}>Go to checkout <ArrowRight size={18}/></Link>
        <Link href="/contact" className="text-link mt-2 text-sm" onNavigate={close}>Need help?</Link>
      </div>}
    </SheetContent>
  </Sheet>;
}

export function Footer({ contact }: { contact: Pick<import("@/lib/business").BusinessDetails, "tradingName" | "supportEmail" | "whatsapp" | "serviceHours"> }) {
  return <footer className="site-footer">
    <div className="shell footer-inner">
      <div><Brand inverse/><p>Imported groceries for kitchens across Nigeria.</p><Link href="/about">About Imperial</Link></div>
      <div><h2>Shop by category</h2>{categories.slice(0, 3).map((category) => <Link key={category.id} href={`/shop?category=${category.id}`}>{category.name}</Link>)}<Link href="/shop?category=hampers">Hampers</Link><Link href="/shop">All categories</Link><Link href="/wholesale">Wholesale</Link></div>
      <div><h2>Help with your order</h2><Link href="/track">Track your order</Link><Link href="/delivery">Delivery areas</Link><Link href="/returns">Returns &amp; refunds</Link><Link href="/faq">FAQ</Link></div>
      <div><h2>Contact Imperial</h2><Link href="/contact">Customer service</Link>{contact.supportEmail && <a href={`mailto:${contact.supportEmail}`}>Email support</a>}{contact.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp support</a>}{contact.serviceHours && <p className="footer-detail"><Clock3 size={17}/>{contact.serviceHours}</p>}</div>
    </div>
    <div className="shell footer-bottom">
      <span>© {new Date().getFullYear()} {contact.tradingName}</span>
      <nav className="footer-legal" aria-label="Store policies">
        <Link href="/terms">Terms &amp; Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>
    </div>
  </footer>;
}
