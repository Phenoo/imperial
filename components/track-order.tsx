"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, PackageSearch } from "lucide-react";
import { naira, onlinePaymentLabel, packLabel, productLimit, sellingUnitLabel, type Product } from "@/lib/commerce";
import { fulfilmentStatusLabel, type ReorderLine, type TrackingResult } from "@/lib/order-operations";
import { useShop } from "./shop-context";

type Access = { id: string; phone: string };
type BasketItem = { product: Product; quantity: number };
const date = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

class OrderLookupError extends Error {}

async function findOrder(access: Access, review?: true): Promise<TrackingResult> {
  const response = await fetch("/api/track", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...access, ...(review && { review }) }),
  });
  if (!response.ok) {
    const problem: { error?: string; fields?: { message: string }[] } = await response.json().catch(() => ({}));
    throw new OrderLookupError(problem.fields?.[0]?.message ?? problem.error ?? "Order lookup failed. Please try again.");
  }
  return response.json() as Promise<TrackingResult>;
}

function reviewSignature(lines: ReorderLine[]) {
  return JSON.stringify(lines.map(({ current, original }) => current
    ? [current.id, current.name, current.price, packLabel(current), productLimit(current), current.minimumQuantity ?? 1, original.quantity]
    : [original.productId]));
}

export function TrackOrder({ initialReference }: { initialReference: string }) {
  const shop = useShop();
  const router = useRouter();
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [review, setReview] = useState<ReorderLine[] | null>(null);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [loading, setLoading] = useState<"lookup" | "review" | null>(null);
  const access = useRef<Access | null>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const credentials = { id: String(form.get("reference") ?? ""), phone: String(form.get("phone") ?? "") };
    pending.current = true;
    access.current = null;
    setLoading("lookup");
    setError("");
    setResult(null);
    setReview(null);
    setReviewError("");
    try {
      const order = await findOrder(credentials);
      access.current = credentials;
      setResult(order);
    } catch (error) {
      setError(error instanceof OrderLookupError ? error.message : "We couldn’t look up your order. Please try again.");
    } finally {
      pending.current = false;
      setLoading(null);
    }
  }

  function quantities(lines: ReorderLine[]) {
    return lines.map(({ original, current }) => {
      if (!current || current.price === null) return { quantity: 0, reason: current ? "Price on request" : "Variant no longer listed" };
      const alreadyInBasket = shop.items.find((item) => item.product.id === current.id)?.quantity ?? 0;
      const available = productLimit(current);
      const quantity = Math.min(original.quantity, Math.max(0, available - alreadyInBasket));
      const minimum = current.minimumQuantity ?? 1;
      if (quantity === 0) return { quantity, reason: available ? "The available quantity is already in your basket" : "Out of stock" };
      if (quantity + alreadyInBasket < minimum) return { quantity: 0, reason: `Current minimum is ${minimum} selling units` };
      return { quantity, reason: quantity < original.quantity ? "Quantity reduced to fit current stock and basket limits" : "" };
    });
  }

  async function buyAgain(apply: boolean) {
    const credentials = access.current;
    if (!credentials || pending.current) return;
    pending.current = true;
    setLoading("review");
    setReviewError("");
    try {
      const order = await findOrder(credentials, true);
      const lines = order.reorder ?? [];
      setResult(order);
      setReview(lines);
      if (!apply || !review) {
        router.refresh();
        return;
      }
      if (reviewSignature(lines) !== reviewSignature(review)) {
        router.refresh();
        setReviewError("A product changed. Review the updated quantities, pack sizes and prices before adding them.");
        return;
      }
      const currentQuantities = quantities(lines);
      const selected = lines.flatMap(({ current }, index): BasketItem[] => {
        const { quantity } = currentQuantities[index];
        return current && quantity ? [{ product: current, quantity }] : [];
      });
      if (!selected.length || !shop.addReorder(selected)) {
        router.refresh();
        setReviewError("Check your basket and its quantity limits, then review these items again.");
        return;
      }
      router.refresh();
      shop.setPanel("cart");
      setReview(null);
    } catch (error) {
      setReviewError(error instanceof OrderLookupError ? error.message : "We couldn’t check the current products. Please try again.");
    } finally {
      pending.current = false;
      setLoading(null);
    }
  }

  const proposed = review ? quantities(review) : [];
  return <div className="track-layout">
    <form className="form-card" onSubmit={submit}>
      <h2><PackageSearch size={23}/> Order lookup</h2>
      <label>Order reference<input name="reference" defaultValue={initialReference} placeholder="IP-…" maxLength={27} required/></label>
      <label>Phone used at checkout<input name="phone" type="tel" autoComplete="tel" placeholder="0800 000 0000" maxLength={20} required/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-green" type="submit" disabled={Boolean(loading)}>{loading === "lookup" ? "Looking up order…" : "Find my order"} <ArrowRight size={18}/></button>
      <Link className="text-link mt-3" href="/contact">Get help with an order</Link>
    </form>
    {result && <div className="grid min-w-0 gap-4">
      <section className="form-card track-result" aria-live="polite">
        <span className="eyebrow">{result.id}</span>
        <h2>{result.mode === "simulated" ? "Test order" : result.mode === "unconfirmed" ? "Order record" : fulfilmentStatusLabel[result.status]}</h2>
        {result.mode === "simulated" && <p className="inline-notice">This order was recorded for testing. Sandbox payments are simulated.</p>}
        {result.mode === "unconfirmed" && <p className="inline-notice">Contact support to confirm payment and fulfilment for this order.</p>}
        {result.paymentStatus && result.mode !== "unconfirmed" && <p>{result.mode === "simulated"
          ? result.paymentStatus === "paid" ? "Test payment confirmed" : `Test payment status: ${onlinePaymentLabel[result.paymentStatus]}`
          : `Payment status: ${onlinePaymentLabel[result.paymentStatus]}`}</p>}
        <ol aria-label="Recorded fulfilment events">{result.events.map((event, index) => (
          <li key={`${event.status}-${event.at ?? index}`} className="complete" aria-current={index === result.events.length - 1 ? "step" : undefined}>
            <span><Check size={14} aria-hidden="true"/></span>
            <div>{fulfilmentStatusLabel[event.status]}
              {event.at && <time className="muted block text-sm font-normal" dateTime={event.at}>{date.format(new Date(event.at))}</time>}
            </div>
          </li>
        ))}</ol>
        <div className="summary-line"><span>{result.mode === "simulated" ? "Test order total" : "Recorded order total"}</span><strong>{naira(result.total)}</strong></div>
        <button className="button button-outline mt-3" type="button" disabled={Boolean(loading)} onClick={() => void buyAgain(false)}>
          {loading === "review" && !review ? "Checking current products…" : "Buy again"} <ArrowRight size={18}/>
        </button>
        {reviewError && !review && <p className="form-error" role="alert">{reviewError}</p>}
      </section>
      {review && <section className="form-card" aria-labelledby="reorder-title">
        <h2 id="reorder-title">Review your new basket</h2>
        <p className="muted">Check the current packs, prices and quantities before adding these products.</p>
        {!review.length && <p className="inline-notice" role="status">There are no products to reorder from this record.</p>}
        <ul className="mt-3 grid gap-3">
          {review.map(({ original, current }, index) => {
            const { quantity, reason } = proposed[index];
            return <li className="rounded-lg border border-[var(--line)] p-3" key={original.productId}>
              <strong>{current?.name ?? original.name}</strong>
              <p className="muted text-sm">{current ? packLabel(current) : original.size}</p>
              {quantity > 0 && current && current.price !== null && <p>{quantity} {sellingUnitLabel(current.saleUnit, quantity)} at {naira(current.price)} each</p>}
              {current?.price && current.price !== original.price && <p className="muted text-sm">Price changed from {naira(original.price)}.</p>}
              {current && packLabel(current) !== original.size && <p className="muted text-sm">Previous pack: {original.size || "unconfirmed"}.</p>}
              {reason && <p className="muted mt-1">{reason}</p>}
              {current?.price === null && <Link className="text-link mt-1" href={`/wholesale?product=${encodeURIComponent(current.id)}`}>Request a quote</Link>}
            </li>;
          })}
        </ul>
        {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
        <button className="button button-green mt-3" type="button" disabled={Boolean(loading) || !proposed.some(({ quantity }) => quantity > 0)} onClick={() => void buyAgain(true)}>
          {loading === "review" ? "Checking availability…" : "Add reviewed products to basket"}
        </button>
      </section>}
    </div>}
  </div>;
}
