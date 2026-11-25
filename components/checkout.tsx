"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleCheck, CreditCard, MapPin, ShoppingBag, Truck } from "lucide-react";
import { basketProductLimit, isPreviewProduct, naira, normalizePhone, paymentProviderName, packLabel, sellingUnitLabel, type OrderSummary, type PaymentProvider } from "@/lib/commerce";
import { estimateDelivery } from "@/lib/delivery-estimate";
import { nigerianStates } from "@/lib/nigerian-states";
import { recordShopEvent } from "@/lib/shop-analytics";
import { BasketReview } from "./basket-review";
import { DeliveryAreaSelect } from "./delivery-location";
import { ProductImage } from "./product-image";
import { useShop } from "./shop-context";
import { Quantity } from "./shop-chrome";

type ApiError = { error: string; fields?: { field: string; message: string }[] };

export function Checkout({ onlinePayment, allowDeliveryPayment, whatsapp, provider = "bachs" }: { provider?: PaymentProvider; onlinePayment: "sandbox" | "live" | null; allowDeliveryPayment: boolean; whatsapp: string | null }) {
  const shop = useShop();
  const providerName = paymentProviderName(provider);
  const [destination, setDestination] = useState({ state: "", town: "" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<OrderSummary | null>(null);
  const [method, setMethod] = useState<"delivery" | "online">(allowDeliveryPayment ? "delivery" : "online");
  const retry = useRef<{ request: string; key: string } | null>(null);
  const submitting = useRef(false);
  const router = useRouter();
  const zone = shop.delivery.zones.find((entry) => entry.id === shop.area)?.id;
  const estimate = estimateDelivery(shop.area, shop.subtotal, shop.delivery, shop.items);
  const shipping = estimate.kind === "priced" ? estimate.fee : undefined;
  const needsQuote = estimate.kind === "quote";
  const basketNeedsReview = shop.invalidQuantities || shop.unavailableCount > 0 || shop.changes.length > 0;
  const ownerPreview = shop.items.some(({ product }) => isPreviewProduct(product));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ownerPreview || (!allowDeliveryPayment && !onlinePayment) || !zone || estimate.kind !== "priced" || !shop.items.length || !shop.available || basketNeedsReview || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "").trim();
    if (!/^\+?[\d ()-]{10,20}$/.test(phone) || !/^0[789]\d{9}$/.test(normalizePhone(phone))) {
      setError("Enter a Nigerian mobile number, such as 0801 234 5678 or +234 801 234 5678.");
      const field = event.currentTarget.elements.namedItem("phone");
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    const landmark = String(form.get("landmark") ?? "").trim();
    const instructions = String(form.get("notes") ?? "").trim();
    const substitution = form.get("substitution") === "remove" ? "Remove any unavailable item." : "Contact me before replacing any item.";
    const notes = [landmark && `Landmark: ${landmark}`, instructions, substitution].filter(Boolean).join("\n");
    const customer = {
      name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), phone,
      address: String(form.get("address") ?? ""), notes, zone,
    };
    const items = shop.items.map(({ product, quantity }) => ({ productId: product.id, quantity, price: product.price }));
    const request = JSON.stringify({ customer, items, method });
    submitting.current = true;
    setWorking(true);
    setError("");
    try {
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() };
      const response = await fetch(method === "online" ? "/api/checkout/online" : "/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, items, key: retry.current.key }),
      });
      if (!response.ok) {
        const problem: ApiError = await response.json();
        setError(response.status === 502 && method === "online" && !allowDeliveryPayment
          ? "Online checkout is temporarily unavailable. Please try again."
          : problem.fields?.[0]?.message ?? problem.error ?? "We couldn’t place your order.");
        if (response.status === 409) {
          if (method === "online") retry.current = null;
          router.refresh();
        }
        return;
      }
      if (method === "online") {
        const online: { id: string; checkoutUrl: string } = await response.json();
        try { sessionStorage.setItem("imperial-online-order", JSON.stringify({ id: online.id, items })); } catch { /* Checkout works without storage. */ }
        window.location.assign(online.checkoutUrl);
        return;
      }
      const order: OrderSummary = await response.json();
      setReceipt(order);
      shop.clear();
      router.refresh();
      window.scrollTo({ top: 0 });
    } catch {
      setError("We couldn’t confirm your order. Try again with the same details so we can check for the original order.");
    } finally {
      submitting.current = false;
      setWorking(false);
    }
  }

  if (receipt) return <div className="checkout-success empty-state" role="status">
    <CircleCheck size={54}/><h2>{receipt.simulated ? "Test order recorded" : "Order placed"}</h2>
    <p>{receipt.simulated ? "This is a simulated order. Keep the reference to try order tracking." : `Keep your reference to track the order. Pay ${naira(receipt.total)} when your order arrives.`}</p>
    <strong className="order-reference">{receipt.id}</strong>
    <div className="flex flex-wrap justify-center gap-3"><Link href={`/track?ref=${receipt.id}`} className="button button-green">Track this order <ArrowRight size={18}/></Link><Link href="/shop" className="button button-outline">Continue shopping</Link></div>
  </div>;

  const quoteMessage = !ownerPreview && needsQuote && whatsapp && destination.state && destination.town.trim().length >= 2 && [
    "Hi Imperial, could I get a delivery quote for this basket?",
    `Delivery area: ${destination.town.trim()}, ${destination.state}`,
    "",
    ...shop.items.map(({ product, quantity }) => `${quantity} ${sellingUnitLabel(product.saleUnit, quantity)} — ${product.name} (${packLabel(product)})`),
  ].join("\n");

  return <>
    {onlinePayment === "sandbox" && <p className="inline-notice">Online payments on this storefront are simulated.</p>}
    {shop.items.length === 0 ? <div className="checkout-success empty-state">
      <ShoppingBag size={38}/><h2>Your basket is empty.</h2><p>Add a few pantry favourites before checking out.</p>
      <BasketReview/>
      <Link href="/shop" className="button button-green">Browse the pantry <ArrowRight size={17}/></Link>
    </div> : <form onSubmit={submit} className="checkout-grid">
      <fieldset className="form-card" disabled={working}>
        <legend className="sr-only">Delivery details</legend>
        <h2><MapPin size={23}/> Delivery details</h2>
        <DeliveryAreaSelect required/>
        {needsQuote && !ownerPreview && <>
          <p className="inline-notice">Share your basket and delivery area to request a quote. Imperial will confirm the delivery charge and estimated arrival before you order.</p>
          <div className="form-grid mt-3">
            <label>State<select autoComplete="address-level1" value={destination.state} onChange={(event) => setDestination({ ...destination, state: event.target.value })}>
              <option value="">Select a state</option>
              {nigerianStates.map((state) => <option key={state}>{state}</option>)}
            </select></label>
            <label>Town, LGA or area<input value={destination.town} autoComplete="address-level2" maxLength={80} onChange={(event) => setDestination({ ...destination, town: event.target.value })}/></label>
          </div>
        </>}
        {estimate.kind === "minimum" && <p className="inline-notice">The minimum product subtotal for Lagos delivery is {naira(estimate.minimum)}.</p>}
        <fieldset hidden={needsQuote || !zone || ownerPreview} disabled={needsQuote || !zone || ownerPreview}>
          <div className="form-grid mt-3">
            <label>Recipient name<input name="name" autoComplete="name" required minLength={2} maxLength={90}/></label>
            <label>Nigerian mobile number<input name="phone" type="tel" autoComplete="tel" placeholder="0801 234 5678" required maxLength={20}/></label>
            <label className="field-wide">Email {!(method === "online" && provider === "paystack") && <span className="optional">(optional)</span>}<input name="email" type="email" autoComplete="email" required={method === "online" && provider === "paystack"} maxLength={150} aria-describedby="checkout-email-use"/><small id="checkout-email-use" className="muted">{method === "online" && provider === "paystack" ? "Paystack requires your email address to start checkout." : "For your receipt and order updates when email is available."}</small></label>
            <label className="field-wide">Street address<textarea name="address" rows={2} autoComplete="street-address" minLength={8} maxLength={250} placeholder="House number, street and neighbourhood" required/></label>
            <label>Landmark <span className="optional">(optional)</span><input name="landmark" maxLength={100}/></label>
            <label>If an item is unavailable<select name="substitution"><option value="contact">Contact me before replacing it</option><option value="remove">Remove the unavailable item</option></select></label>
            <label className="field-wide">Delivery instructions <span className="optional">(optional)</span><textarea name="notes" rows={2} maxLength={180}/></label>
          </div>
          {onlinePayment ? <fieldset className="checkout-payment">
            <legend>Payment method</legend>
            {allowDeliveryPayment && <label className="payment-method"><input type="radio" name="payment" value="delivery" checked={method === "delivery"} onChange={() => setMethod("delivery")}/><div><strong>Pay on delivery</strong><p>Pay when your groceries arrive.</p></div></label>}
            <label className="payment-method"><input type="radio" name="payment" value="online" checked={method === "online"} onChange={() => setMethod("online")}/><div><strong>{onlinePayment === "sandbox" ? `Test payment with ${providerName}` : `Pay online with ${providerName}`}</strong><p>{onlinePayment === "sandbox" ? `Opens ${providerName} in test mode.` : `Choose an available payment method on ${providerName}’s secure checkout.`}</p></div></label>
          </fieldset> : allowDeliveryPayment ? <div className="payment-method"><CreditCard size={23}/><div><strong>Pay on delivery</strong><p>Payment is due when your groceries arrive.</p></div><Check size={20}/></div> : null}
        </fieldset>
      </fieldset>
      <aside className="form-card checkout-summary">
        <h2><ShoppingBag size={23}/> Your basket</h2>
        <BasketReview/>
        <ul className="checkout-items">{shop.items.map(({ product, quantity }) => <li key={product.id}>
          <ProductImage product={product} sizes="64px"/>
          <div><strong>{product.name}</strong><p>{packLabel(product)} · {naira(product.price)} per {sellingUnitLabel(product.saleUnit)}</p>
            {!working && <div className="flex flex-wrap items-center gap-2"><Quantity label={product.name} quantity={quantity} min={product.minimumQuantity ?? 1} max={basketProductLimit(product)} onChange={(next) => shop.setQuantity(product, next)}/>
              <button type="button" className="text-link" onClick={() => shop.setQuantity(product, 0)} aria-label={`Remove ${product.name}`}>Remove</button></div>}
            {working && <span>{quantity} {sellingUnitLabel(product.saleUnit, quantity)}</span>}
            {!isPreviewProduct(product) && quantity > product.stock && <small className="form-error">Only {product.stock} in stock.</small>}
            {quantity < (product.minimumQuantity ?? 1) && <small className="form-error">Minimum {product.minimumQuantity} {sellingUnitLabel(product.saleUnit, product.minimumQuantity)}.</small>}
          </div><b>{naira(quantity * product.price)}</b>
        </li>)}</ul>
        <div className="summary-line"><span>Subtotal</span><strong>{naira(shop.subtotal)}</strong></div>
        <div className="summary-line"><span>Delivery</span><strong>{needsQuote ? "Quote required" : estimate.kind === "minimum" ? "Minimum subtotal required" : shipping === undefined ? "Select an area" : shipping === 0 ? "Free" : naira(shipping)}</strong></div>
        {estimate.kind === "priced" && <p className="muted text-sm">Estimated delivery in {estimate.time}</p>}
        {needsQuote ? ownerPreview
          ? <p className="inline-notice">Delivery charges outside Lagos are confirmed separately.</p>
          : whatsapp
          ? quoteMessage && !basketNeedsReview
            ? <a className="button button-green" href={`${whatsapp}?text=${encodeURIComponent(quoteMessage)}`} onClick={() => recordShopEvent("delivery_quote_click")} target="_blank" rel="noopener noreferrer">Get a delivery quote on WhatsApp <ArrowRight size={19}/></a>
            : <p className="inline-notice">{basketNeedsReview ? "Review your basket to continue." : "Select a state and enter your town or area to continue."}</p>
          : <p className="inline-notice">Contact Imperial for a delivery quote.</p>
          : <>
            {shipping !== undefined && <div className="summary-line summary-total"><span>Total</span><strong>{naira(shop.subtotal + shipping)}</strong></div>}
            {!ownerPreview && (!shop.available || (!allowDeliveryPayment && !onlinePayment)) && <p className="inline-notice">Checkout is unavailable right now.</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {ownerPreview ? <p className="muted mt-3 text-sm">This basket is for owner review. Orders cannot be placed from this page.</p>
              : <p className="muted mt-3 text-sm">By placing your order, you agree to the <Link className="text-link" href="/terms">Terms &amp; Conditions</Link>. See how we use your details in our <Link className="text-link" href="/privacy">Privacy Policy</Link>.</p>}
            <button className="button button-green" type="submit" disabled={ownerPreview || working || !shop.available || (!allowDeliveryPayment && !onlinePayment) || basketNeedsReview || estimate.kind !== "priced"}>{ownerPreview ? "Order submission unavailable" : working ? (method === "online" ? `Opening ${providerName}…` : "Placing order…") : (method === "online" ? `Continue to ${providerName}` : "Place order")} <ArrowRight size={19}/></button>
          </>}
        <Link href="/contact" className="text-link mt-3 text-sm">Need help with your order?</Link>
      </aside>
    </form>}
    <section id="delivery" className="delivery-areas form-card">
      <h2><Truck size={23}/> Nationwide delivery</h2>
      <p>For eligible orders in the Lagos areas below, delivery is free from a product subtotal of {naira(shop.delivery.freeFrom)}.</p>
      <dl>{shop.delivery.zones.map((entry) => <div key={entry.id}><dt>{entry.name}</dt><dd>Estimated {entry.time} · {naira(entry.fee)}</dd></div>)}</dl>
      <p className="mt-4"><Link className="text-link" href="/delivery">See delivery and quotation details</Link></p>
    </section>
  </>;
}
