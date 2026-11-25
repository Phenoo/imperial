"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import {
  categories, containedUnits, foodInfoFields, isMultiUnit, MAX_PER_ITEM, purchaseModes, sellingUnits, sellingUnitLabel,
  type Product,
} from "@/lib/commerce";
import type { ProductRecord } from "@/lib/store-server";

const blank: Product = {
  id: "", name: "", brand: "", category: "rice", origin: "", size: "", price: null, comparePrice: null,
  stock: 0, rank: 100, image: "", description: "", active: true, featured: false,
};

const purchaseModeLabel = {
  quote: "Quote only",
  retail: "Retail",
  wholesale: "Wholesale",
  both: "Retail and wholesale",
};

export function ProductEditor({ record, onClose, save, busy }: {
  record: ProductRecord | "new";
  onClose: () => void;
  save: (product: Product, version: string | null) => void;
  busy: boolean;
}) {
  const initial = record === "new" ? blank : record;
  const [unit, setUnit] = useState(initial.saleUnit);
  const [stockConfirmed, setStockConfirmed] = useState(Boolean(initial.stockVerified));
  const [pricePublished, setPricePublished] = useState(Boolean(initial.pricePublished));
  const multiUnit = isMultiUnit(unit);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const lines = (key: string) => text(key).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const name = text("name");
    const slug = text("id") || name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-$/, "");
    const containedUnit = containedUnits.find((value) => value === text("containedUnit"));
    const purchaseMode = purchaseModes.find((value) => value === text("purchaseMode"));
    const approval = form.has("checkoutApproved");
    const publishPrice = pricePublished && Boolean(text("price"));
    const bundleContents = lines("bundleContents");
    const labelImages = lines("labelImages");
    const foodEntries = Object.keys(foodInfoFields).map((field) => [field, text(field)]).filter((entry) => entry[1]);
    const sku = text("sku");
    const variantGroup = text("variantGroup");
    const totalSize = text("totalSize");
    const minimumQuantity = text("minimumQuantity");
    const shippingWeight = text("shippingWeightGrams");
    save({
      id: record === "new" ? slug : record.id,
      name,
      brand: text("brand"),
      origin: text("origin"),
      size: unit === "bundle" ? "1 bundle" : text("size"),
      ...(sku && { sku }),
      ...(variantGroup && { variantGroup }),
      ...(unit && { saleUnit: unit }),
      ...(multiUnit && text("itemsPerUnit") && { itemsPerUnit: Number(text("itemsPerUnit")) }),
      ...(multiUnit && containedUnit && { containedUnit }),
      ...(totalSize && { totalSize }),
      ...(minimumQuantity && { minimumQuantity: Number(minimumQuantity) }),
      ...(shippingWeight && { shippingWeightGrams: Number(shippingWeight) }),
      ...(form.has("deliveryQuoteOnly") && { deliveryQuoteOnly: true }),
      ...(unit === "bundle" && bundleContents.length && { bundleContents }),
      ...(purchaseMode && { purchaseMode }),
      ...(approval && { checkoutApproved: true }),
      ...(publishPrice && { pricePublished: true }),
      ...(stockConfirmed && { stockVerified: true }),
      ...(initial.demo && !approval && !publishPrice && { demo: true }),
      category: categories.find((category) => category.id === text("category"))?.id ?? initial.category,
      price: text("price") ? Number(text("price")) : null,
      comparePrice: text("comparePrice") ? Number(text("comparePrice")) : null,
      stock: Number(text("stock")),
      rank: Number(text("rank")),
      image: text("image"),
      description: text("description"),
      ...(labelImages.length && { labelImages }),
      ...(foodEntries.length && { food: Object.fromEntries(foodEntries) }),
      active: form.has("active"),
      featured: form.has("featured"),
    }, record === "new" ? null : record.version);
  }

  return <form className="form-card editor-card" onSubmit={submit}>
    <div className="admin-section-head">
      <h2>{record === "new" ? "New product" : `Edit ${record.name}`}</h2>
      <button className="button button-outline" type="button" onClick={onClose} disabled={busy}>Close editor</button>
    </div>
    <fieldset className="form-grid" disabled={busy}>
      <legend className="sr-only">Product details</legend>
      <label>Product name<input name="name" defaultValue={initial.name} minLength={3} maxLength={110} required/></label>
      <label>Product URL identifier<input name="id" defaultValue={initial.id} readOnly={record !== "new"} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="Generated from name if blank"/></label>
      <label>SKU<input name="sku" defaultValue={initial.sku} maxLength={80} placeholder="Defaults to the product identifier"/></label>
      <label>Variant group<input name="variantGroup" defaultValue={initial.variantGroup} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="Match this identifier across sizes or packs"/></label>
      <label>Brand<input name="brand" defaultValue={initial.brand} maxLength={45} required/></label>
      <label>Category<select name="category" defaultValue={initial.category}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label>Origin <span className="optional">(optional)</span><input name="origin" defaultValue={initial.origin} maxLength={65}/></label>
      <label>Selling unit<select name="saleUnit" value={unit ?? ""} onChange={(event) => {
        setUnit(sellingUnits.find((value) => value === event.target.value));
        setPricePublished(false);
      }}>
        <option value="">To confirm</option>
        {sellingUnits.map((value) => <option key={value} value={value}>{sellingUnitLabel(value)}</option>)}
      </select></label>
      {unit !== "bundle" && <label>Weight or volume per item<input name="size" defaultValue={initial.size} onChange={() => setPricePublished(false)} maxLength={35} placeholder="Use the verified weight or volume from the label"/></label>}
      {multiUnit && <>
        <label>Items per selling unit<input name="itemsPerUnit" type="number" step="1" min={1} max={1000} defaultValue={initial.itemsPerUnit ?? initial.unitsPerCarton} onChange={() => setPricePublished(false)}/></label>
        <label>Inside the pack<select name="containedUnit" defaultValue={initial.containedUnit ?? ""} onChange={() => setPricePublished(false)}><option value="">To confirm</option>{containedUnits.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Total weight or volume <span className="optional">(optional)</span><input name="totalSize" defaultValue={initial.totalSize} maxLength={35} onChange={() => setPricePublished(false)}/></label>
      </>}
      {unit === "bundle" && <label className="field-wide">Bundle contents<textarea name="bundleContents" rows={4} defaultValue={initial.bundleContents?.join("\n")} onChange={() => setPricePublished(false)} placeholder="Enter one exact product, quantity and size per line"/></label>}
      <label>Purchasing route<select name="purchaseMode" defaultValue={initial.purchaseMode ?? "quote"}>
        {purchaseModes.map((value) => <option key={value} value={value}>{purchaseModeLabel[value]}</option>)}
      </select></label>
      <label>Minimum selling units per order<input name="minimumQuantity" type="number" step="1" min={1} max={MAX_PER_ITEM} defaultValue={initial.minimumQuantity ?? 1}/></label>
      <label>Shipping weight per selling unit (grams)<input name="shippingWeightGrams" type="number" step="1" min={1} max={100000000} defaultValue={initial.shippingWeightGrams} placeholder="Use verified packed weight"/></label>
      <label className="check-label"><input name="deliveryQuoteOnly" type="checkbox" defaultChecked={initial.deliveryQuoteOnly}/> This item requires a delivery quote</label>
      <label>Confirmed price per selling unit (₦)<input name="price" type="number" step="1" min={1} max={10000000} defaultValue={initial.demo ? "" : initial.price ?? ""} placeholder="Leave blank for price on request"/></label>
      <label>Original price (₦, optional)<input name="comparePrice" type="number" step="1" min={1} max={10000000} defaultValue={initial.demo ? "" : initial.comparePrice ?? ""}/></label>
      <label>Selling units in stock<input name="stock" type="number" step="1" min={0} max={1000000} defaultValue={initial.stockVerified ? initial.stock : ""} required={stockConfirmed} placeholder="Leave blank for unconfirmed stock"/></label>
      <label>Display priority<input name="rank" type="number" step="1" min={0} max={1000000} defaultValue={initial.rank} required/></label>
      <label className="check-label"><input name="stockVerified" type="checkbox" checked={stockConfirmed} onChange={(event) => setStockConfirmed(event.target.checked)}/> Stock count has been verified</label>
      <label className="check-label"><input name="pricePublished" type="checkbox" checked={pricePublished} onChange={(event) => setPricePublished(event.target.checked)}/> Show price on quote-only listings</label>
      <label className="check-label"><input name="checkoutApproved" type="checkbox" defaultChecked={initial.checkoutApproved}/> Enable checkout at the confirmed price</label>
      <p className="muted field-wide text-sm">Enter the exact selling unit and verify price and stock before enabling checkout. Track distinct stock for each SKU, including variants sold by the carton.</p>
      <label className="field-wide">Product image<input name="image" defaultValue={initial.image} placeholder="HTTPS image URL or /images/filename.webp" maxLength={1000} required/></label>
      <label className="field-wide">Packaging and label photos<textarea name="labelImages" rows={3} defaultValue={initial.labelImages?.join("\n")} placeholder="Up to six image URLs, one per line"/></label>
      <label className="field-wide">Description<textarea name="description" rows={3} minLength={10} maxLength={1200} defaultValue={initial.description} required/></label>
      <details className="field-wide">
        <summary>Verified food and label information</summary>
        <div className="form-grid mt-3">
          {Object.entries(foodInfoFields).map(([field, label]) => {
            const key = field as keyof typeof foodInfoFields;
            return <label key={key}>{label}<textarea name={key} rows={2} maxLength={["manufacturer", "country", "registration", "shelfLife"].includes(key) ? 100 : 1200} defaultValue={initial.food?.[key]}/></label>;
          })}
        </div>
      </details>
      <label className="check-label"><input name="active" type="checkbox" defaultChecked={initial.active}/> Publish in the shop</label>
      <label className="check-label"><input name="featured" type="checkbox" defaultChecked={initial.featured}/> Feature on the homepage</label>
    </fieldset>
    <button className="button button-green" type="submit" disabled={busy}>{busy ? "Saving…" : "Save product"} <ArrowRight size={17}/></button>
  </form>;
}
