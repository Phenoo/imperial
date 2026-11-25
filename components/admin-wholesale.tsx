"use client";

import { ChevronDown } from "lucide-react";
import type { FormEvent } from "react";
import { naira } from "@/lib/commerce";
import type { WholesaleQuoteInput, WholesaleRequest } from "@/lib/validation";
import {
  canPrepareWholesaleQuote, MAX_WHOLESALE_QUANTITY, nextWholesaleStatuses, wholesaleQuantityLabel,
  wholesaleStatusLabel, wholesaleUnitLabel, wholesaleUnits, type WholesaleStatus,
} from "@/lib/wholesale";

const date = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export function WholesaleDetails({ request, busy, onUpdate, onQuote }: {
  request: WholesaleRequest;
  busy: boolean;
  onUpdate: (id: string, status: WholesaleStatus) => void;
  onQuote: (id: string, quote: WholesaleQuoteInput, previousQuoteAt: string | null) => void;
}) {
  const { contact, items, status, quote } = request;
  const transitions = nextWholesaleStatuses[status];

  function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const lines = items.flatMap(({ productId }) => {
      const unit = wholesaleUnits.find((entry) => entry === fields.get(`unit-${productId}`));
      if (!unit) return [];
      return [{
        productId, unit,
        quantity: Number(fields.get(`quantity-${productId}`)),
        specification: String(fields.get(`specification-${productId}`) ?? ""),
        unitPrice: Number(fields.get(`unitPrice-${productId}`)),
      }];
    });
    onQuote(request.id, {
      items: lines, delivery: Number(fields.get("delivery")), validUntil: String(fields.get("validUntil") ?? ""),
    }, quote?.updatedAt ?? null);
  }

  return <details className="admin-order">
    <summary>
      <div><strong>{contact.business || contact.name}</strong><small>{request.id}</small></div>
      <time dateTime={request.createdAt}>{date.format(new Date(request.createdAt))}</time>
      <span className={`admin-badge ${status === "new" ? "status-placed" : status === "closed" ? "" : "status-confirmed"}`}>{wholesaleStatusLabel[status]}</span>
      <b>{items.length} {items.length === 1 ? "item" : "items"}</b>
      <ChevronDown size={17} aria-hidden="true"/>
    </summary>
    <div className="admin-order-body">
      <div>
        <h3>Contact and delivery</h3>
        <p>{contact.name}</p>
        <p><a className="text-link" href={`tel:${contact.phone}`}>{contact.phone}</a></p>
        {contact.email && <p><a className="text-link break-all" href={`mailto:${contact.email}`}>{contact.email}</a></p>}
        <p>{[contact.location, contact.state].filter(Boolean).join(", ")}</p>
        {contact.preferredTiming && <p>Preferred timing: {contact.preferredTiming}</p>}
        {contact.notes && <p className="break-words">{contact.notes}</p>}
      </div>
      <div>
        <h3>Requested products</h3>
        <ul>{items.map((item) => <li key={item.productId} className="summary-line items-start">
          <span>{item.name}{item.sku && <small className="muted block">{item.sku}</small>}{item.size && <small className="muted block">Catalogue pack: {item.size}</small>}</span>
          <b>{wholesaleQuantityLabel(item.quantity, item.unit)}</b>
        </li>)}</ul>
      </div>
      {quote && <section className="field-wide rounded-lg border border-[var(--line)] p-4" aria-label="Saved quotation">
        <h3>Saved quotation</h3>
        <p>Valid through <time dateTime={quote.validUntil}>{date.format(new Date(quote.validUntil))}</time></p>
        <ul className="mt-3">{quote.items.map((line) => <li className="summary-line items-start" key={line.productId}>
          <span><b>{items.find((item) => item.productId === line.productId)?.name}</b><br/>
            {line.specification} · {wholesaleQuantityLabel(line.quantity, line.unit)} at {naira(line.unitPrice)} each
          </span>
          <strong>{naira(line.quantity * line.unitPrice)}</strong>
        </li>)}</ul>
        <p className="summary-line"><span>Items subtotal</span><b>{naira(quote.subtotal)}</b></p>
        <p className="summary-line"><span>Delivery</span><b>{naira(quote.delivery)}</b></p>
        <p className="summary-line"><span>Quote total</span><b>{naira(quote.total)}</b></p>
      </section>}
      {canPrepareWholesaleQuote(status) && <details className="field-wide rounded-lg border border-[var(--line)] p-4">
        <summary className="block! min-h-0! cursor-pointer font-extrabold">{quote ? "Edit quotation" : "Prepare itemised quotation"}</summary>
        <form key={quote?.updatedAt ?? "new"} onSubmit={saveQuote} className="form-card mt-3">
          <fieldset disabled={busy} className="grid gap-4">
            <p className="muted">Confirm the exact pack, quantity, unit price and delivery charge before saving. Share the saved quotation with the customer using their contact details.</p>
            {items.map((item) => {
              const line = quote?.items.find((entry) => entry.productId === item.productId);
              return <fieldset key={item.productId} className="form-grid">
                <legend className="mb-2 font-bold">{item.name}</legend>
                <label className="field-wide">Confirmed specification
                  <input name={`specification-${item.productId}`} defaultValue={line?.specification} minLength={3} maxLength={150} required placeholder="Exact item count and size per selling unit"/>
                </label>
                <label>Quantity
                  <input name={`quantity-${item.productId}`} type="number" min={1} max={MAX_WHOLESALE_QUANTITY} step={1} defaultValue={line?.quantity ?? item.quantity} required/>
                </label>
                <label>Selling unit
                  <select name={`unit-${item.productId}`} defaultValue={line?.unit ?? item.unit}>
                    {wholesaleUnits.map((unit) => <option key={unit} value={unit}>{wholesaleUnitLabel[unit]}</option>)}
                  </select>
                </label>
                <label>Price per selling unit (₦)
                  <input name={`unitPrice-${item.productId}`} type="number" min={1} max={10000000} step={1} defaultValue={line?.unitPrice} required/>
                </label>
              </fieldset>;
            })}
            <div className="form-grid">
              <label>Confirmed delivery charge (₦)
                <input name="delivery" type="number" min={0} max={10000000} step={1} defaultValue={quote?.delivery} required/>
              </label>
              <label>Valid through
                <input name="validUntil" type="date" defaultValue={quote?.validUntil} required/>
              </label>
            </div>
            <button type="submit" className="button button-green w-fit">Save quotation</button>
          </fieldset>
        </form>
      </details>}
      {transitions.length > 0 && <div className="order-actions">
        {transitions.map((next) => <button key={next} className="button button-outline" type="button" disabled={busy} onClick={() => onUpdate(request.id, next)}>
          {next === "closed" ? "Close request" : `Mark ${wholesaleStatusLabel[next].toLowerCase()}`}
        </button>)}
      </div>}
    </div>
  </details>;
}
