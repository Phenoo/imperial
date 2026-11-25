"use client";

import Link from "next/link";
import { ArrowRight, Boxes, CircleCheck, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { packLabel } from "@/lib/commerce";
import { nigerianStates } from "@/lib/nigerian-states";
import { recordShopEvent } from "@/lib/shop-analytics";
import { MAX_WHOLESALE_ITEMS, MAX_WHOLESALE_QUANTITY, quoteUnit, wholesaleQuantityLabel, wholesaleUnitLabel, wholesaleUnits, type WholesaleUnit } from "@/lib/wholesale";
import { useShop } from "./shop-context";

type Row = { id: number; productId: string; search: string; unit: WholesaleUnit };
type QuoteResponse = { id?: string; error?: string; fields?: { message: string }[] };

export function WholesaleForm({ initialProduct }: { initialProduct: string }) {
  const { catalog, available } = useShop();
  const [rows, setRows] = useState<Row[]>(() => {
    const product = catalog.find((entry) => entry.id === initialProduct);
    return [{ id: 0, productId: product?.id ?? "", search: "", unit: quoteUnit(product?.saleUnit) }];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const nextRowId = useRef(1);
  const pending = useRef(false);
  const retry = useRef<{ key: string; payload: string } | null>(null);
  const confirmation = useRef<HTMLElement>(null);
  const canSubmit = available && catalog.length > 0;

  useEffect(() => {
    if (reference) confirmation.current?.focus();
  }, [reference]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canSubmit) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const contact = {
      name: value("name"), business: value("business"), phone: value("phone"),
      email: value("email"), location: value("location"), state: value("state"),
      preferredTiming: value("preferredTiming"), notes: value("notes"),
    };
    const items = rows.map(({ id }) => ({
      productId: value(`product-${id}`), quantity: Number(value(`quantity-${id}`)), unit: value(`unit-${id}`),
    }));
    const payload = JSON.stringify({ contact, items });
    pending.current = true;
    setSubmitting(true);
    setError("");

    try {
      if (retry.current?.payload !== payload) retry.current = { key: crypto.randomUUID(), payload };
      const response = await fetch("/api/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: retry.current.key, contact, items }),
      });
      const result: QuoteResponse = await response.json();
      if (!response.ok || !result.id) {
        setError(result.fields?.[0]?.message ?? result.error ?? "We couldn’t send the request. Please try again.");
        return;
      }
      recordShopEvent("wholesale_request_stored");
      setReference(result.id);
    } catch {
      setError("We couldn’t confirm your submission. Try again with the same details to recover your reference.");
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  if (reference) return <section className="checkout-success empty-state" tabIndex={-1} ref={confirmation} aria-labelledby="wholesale-confirmed">
    <CircleCheck size={48}/>
    <h2 id="wholesale-confirmed">Request received</h2>
    <p>Keep this reference for your records. Our team will follow up using the contact details you provided.</p>
    <strong className="order-reference">{reference}</strong>
    <Link href="/shop" className="button button-green">Back to the shop <ArrowRight size={18}/></Link>
  </section>;

  if (!canSubmit) {
    return <p className="inline-notice" role="status">Wholesale requests are temporarily unavailable. Please try again later.</p>;
  }

  return <form className="checkout-grid" onSubmit={submit}>
    <fieldset className="form-card" disabled={submitting}>
      <legend className="sr-only">Products and quantities</legend>
      <h2><Boxes size={23}/> Products and quantities</h2>
      <div className="grid gap-4">
        {rows.map((row, index) => {
          const search = row.search.trim().toLowerCase();
          const exact = catalog.find((product) => product.id === row.productId);
          const minimum = exact?.saleUnit && row.unit === quoteUnit(exact.saleUnit) ? (exact.minimumQuantity ?? 1) : 1;
          const options = catalog.filter((product) => product.id === row.productId ||
            [product.name, product.brand, product.sku, packLabel(product)].join(" ").toLowerCase().includes(search));
          function changeRow(update: Partial<Row>) {
            setRows((previous) => previous.map((entry) => entry.id === row.id ? { ...entry, ...update } : entry));
          }
          return <fieldset key={row.id} className="rounded-lg border border-[var(--line)] p-3 sm:p-4">
            <legend className="px-1 text-sm font-bold">Item {index + 1}</legend>
            <div className="form-grid">
              <label className="field-wide">Search products
                <input type="search" value={row.search} maxLength={100} placeholder="Name, brand or pack size"
                  onChange={(event) => changeRow({ search: event.target.value })}/>
              </label>
              <div className="field-wide flex items-end gap-2">
                <label className="min-w-0 flex-1">Product
                  <select name={`product-${row.id}`} required value={row.productId} onChange={(event) => {
                    const productId = event.target.value;
                    changeRow({ productId, unit: quoteUnit(catalog.find((product) => product.id === productId)?.saleUnit) });
                  }}>
                    <option value="">{options.length ? "Choose a product" : "No matching products"}</option>
                    {options.map((product) => <option key={product.id} value={product.id} disabled={rows.some((other) => other.id !== row.id && other.productId === product.id)}>
                      {[product.name, packLabel(product), product.sku].filter(Boolean).join(" · ")}
                    </option>)}
                  </select>
                </label>
                {rows.length > 1 && <button className="icon-button" type="button" aria-label={`Remove item ${index + 1}`} onClick={() => setRows((previous) => previous.filter((entry) => entry.id !== row.id))}><X size={20}/></button>}
              </div>
              <label>Quantity
                <input name={`quantity-${row.id}`} type="number" min={minimum} max={MAX_WHOLESALE_QUANTITY} step={1} placeholder="e.g. 10" required/>
              </label>
              <label>Preferred supply unit
                <select name={`unit-${row.id}`} value={row.unit} onChange={(event) => {
                  const unit = wholesaleUnits.find((item) => item === event.target.value);
                  if (unit) changeRow({ unit });
                }}>
                  {wholesaleUnits.map((unit) => <option key={unit} value={unit}>{wholesaleUnitLabel[unit]}</option>)}
                </select>
              </label>
              {exact && <p className="field-wide muted text-sm">Catalogue pack: {packLabel(exact) || "to be confirmed"}. We’ll confirm the specification for the requested unit.</p>}
              {minimum > 1 && <p className="field-wide muted text-sm">Minimum order: {wholesaleQuantityLabel(minimum, row.unit)}.</p>}
            </div>
          </fieldset>;
        })}
      </div>
      <button type="button" className="button button-outline mt-4" disabled={rows.length >= Math.min(MAX_WHOLESALE_ITEMS, catalog.length)} onClick={() => {
        const id = nextRowId.current++;
        setRows((previous) => [...previous, { id, productId: "", search: "", unit: "carton" }]);
      }}><Plus size={18}/> Add another product</button>
    </fieldset>

    <fieldset className="form-card" disabled={submitting}>
      <legend className="sr-only">Contact and delivery</legend>
      <h2><UserRound size={23}/> Contact and delivery</h2>
      <div className="form-grid">
        <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={90}/></label>
        <label>Business <span className="optional">(optional)</span><input name="business" autoComplete="organization" maxLength={100}/></label>
        <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength={20}/></label>
        <label>Email <span className="optional">(optional)</span><input name="email" type="email" autoComplete="email" maxLength={150}/></label>
        <label>Delivery state<select name="state" autoComplete="address-level1" defaultValue="" required>
          <option value="" disabled>Select a state</option>
          {nigerianStates.map((state) => <option key={state} value={state}>{state}</option>)}
        </select></label>
        <label>Delivery town or area<input name="location" autoComplete="address-level2" required minLength={2} maxLength={120} placeholder="e.g. Ikeja"/></label>
        <label className="field-wide">Preferred delivery timing <span className="optional">(optional)</span><input name="preferredTiming" maxLength={100} placeholder="e.g. First week of December"/></label>
        <label className="field-wide">Notes <span className="optional">(optional)</span><textarea name="notes" rows={3} maxLength={500} placeholder="Pack preferences, other items or delivery timing"/></label>
      </div>
      {error && <p className="form-error mt-3" role="alert">{error}</p>}
      <p className="muted mt-3 text-sm">We use your details to respond to this request. <Link className="text-link" href="/privacy">Privacy Policy</Link></p>
      <button className="button button-green mt-4 w-full" type="submit">{submitting ? "Sending request…" : "Request a quote"} <ArrowRight size={18}/></button>
    </fieldset>
  </form>;
}
