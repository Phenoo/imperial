"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { staffRequest, StaffRequestError } from "@/lib/admin-client";
import { canCheckoutProduct, categories, categoryName, containedUnits, hasExactPack, isMultiUnit, naira, packLabel, productAvailability, sellingUnitLabel, sellingUnits } from "@/lib/commerce";
import type { CatalogueInviteStatus, CatalogueSuggestion, SharedCatalogue as SharedData, SharedCatalogueProduct } from "@/lib/catalogue-invite";
import type { ProductRecord } from "@/lib/store-server";
import type { CatalogueUpdate } from "@/lib/validation";
import { ProductImage } from "./product-image";
import { CatalogueShare } from "./catalogue-share";

type Draft = Omit<CatalogueUpdate, "itemsPerUnit" | "price" | "stock" | "suggestionVersion"> & {
  itemsPerUnit: string;
  price: string;
  stock: string;
  suggestionVersion: string | null;
};
type Drafts = Record<string, Draft>;
type Catalogue = { products: ProductRecord[] };
type CardProduct = Pick<ProductRecord, "id" | "version" | "name" | "brand" | "category" | "image" | "sku" | "bundleContents">;
type EditorRow = {
  product: CardProduct;
  baseline: Draft;
  packLocked: boolean;
  status: "in-stock" | "out-of-stock" | "quote" | "hidden" | "submitted" | "open";
};

function staffRow(product: ProductRecord): EditorRow {
  return {
    product,
    packLocked: Boolean(product.checkoutApproved || product.stockSpecification),
    status: product.active ? productAvailability(product) : "hidden",
    baseline: {
      id: product.id,
      version: product.version,
      saleUnit: product.saleUnit ?? null,
      size: /^sample\b/i.test(product.size) ? "" : product.size,
      itemsPerUnit: String(product.itemsPerUnit ?? product.unitsPerCarton ?? ""),
      containedUnit: product.containedUnit ?? null,
      totalSize: product.totalSize ?? "",
      price: product.demo ? "" : String(product.price ?? ""),
      stock: !product.demo && product.stockVerified ? String(product.stock) : "",
      purchaseMode: product.purchaseMode ?? "quote",
      checkoutApproved: canCheckoutProduct(product),
      pricePublished: Boolean(product.pricePublished),
      suggestionVersion: null,
    },
  };
}

function suggestedFields(value: Pick<SharedCatalogueProduct, "saleUnit" | "size" | "itemsPerUnit" | "containedUnit" | "totalSize" | "price" | "stock" | "suggestionVersion">) {
  return {
    saleUnit: value.saleUnit,
    size: value.size,
    itemsPerUnit: String(value.itemsPerUnit ?? ""),
    containedUnit: value.containedUnit,
    totalSize: value.totalSize,
    price: String(value.price ?? ""),
    stock: String(value.stock ?? ""),
    suggestionVersion: value.suggestionVersion,
  };
}

function sharedRow(product: SharedCatalogueProduct): EditorRow {
  return {
    product,
    packLocked: product.packLocked,
    status: product.suggestionVersion ? "submitted" : "open",
    baseline: {
      ...suggestedFields(product),
      id: product.id,
      version: product.version,
      purchaseMode: "quote",
      checkoutApproved: false,
    },
  };
}

async function sharedRequest(token: string, options: RequestInit = {}): Promise<SharedData> {
  const response = await fetch("/api/catalogue-update", {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new StaffRequestError(data.fields?.[0]?.message ?? data.error ?? "Couldn’t complete the request.", response.status);
  return data;
}

function numberOrEmpty(text: string) {
  return text.trim() ? Number(text.replaceAll(",", "")) : null;
}

function validNumber(text: string, min: number, max: number) {
  const number = numberOrEmpty(text);
  return number === null || (/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text.trim()) && number >= min && number <= max);
}

function updateFields(draft: Draft) {
  return {
    id: draft.id,
    version: draft.version,
    saleUnit: draft.saleUnit,
    containedUnit: draft.containedUnit,
    size: draft.size.trim(),
    totalSize: draft.totalSize.trim(),
    itemsPerUnit: numberOrEmpty(draft.itemsPerUnit),
    price: numberOrEmpty(draft.price),
    stock: numberOrEmpty(draft.stock),
  };
}

function toUpdate(draft: Draft): CatalogueUpdate {
  return {
    ...updateFields(draft),
    checkoutApproved: draft.checkoutApproved,
    pricePublished: Boolean(draft.pricePublished),
    purchaseMode: draft.purchaseMode,
    ...(draft.suggestionVersion && { suggestionVersion: draft.suggestionVersion }),
  };
}

function draftPack(product: CardProduct, draft: Draft) {
  return {
    size: draft.size.trim(),
    saleUnit: draft.saleUnit ?? undefined,
    itemsPerUnit: numberOrEmpty(draft.itemsPerUnit) ?? undefined,
    containedUnit: draft.containedUnit ?? undefined,
    totalSize: draft.totalSize.trim() || undefined,
    bundleContents: product.bundleContents,
  };
}

function approvalReady(product: CardProduct, draft: Draft) {
  return draft.purchaseMode !== "quote" && Boolean(draft.price.trim() && draft.stock.trim()) &&
    validNumber(draft.price, 1, 10_000_000) && validNumber(draft.stock, 0, 1_000_000) &&
    validNumber(draft.itemsPerUnit, 1, 1_000) && hasExactPack(draftPack(product, draft));
}

function draftError(product: CardProduct, draft: Draft) {
  if (!validNumber(draft.price, 1, 10_000_000)) return "Enter a whole naira price from ₦1 to ₦10,000,000.";
  if (!validNumber(draft.stock, 0, 1_000_000)) return "Enter a whole number between 0 and 1,000,000 for stock.";
  if (!validNumber(draft.itemsPerUnit, 1, 1_000)) return "Enter a whole number from 1 to 1,000 for items per pack.";
  if (draft.checkoutApproved && !approvalReady(product, draft)) return "Confirm the pack, sales route, price and stock before approving checkout.";
}

const statusLabels: Record<EditorRow["status"], string> = {
  "in-stock": "Checkout approved", "out-of-stock": "Out of stock", quote: "Quote only", hidden: "Hidden",
  submitted: "Submitted", open: "To fill",
};

function ProductFields({ row, draft, shared, suggestion, stale, changed, onChange, onReset, onDismiss }: {
  row: EditorRow;
  draft: Draft;
  shared: boolean;
  suggestion?: CatalogueSuggestion;
  stale: boolean;
  changed: boolean;
  onChange: (next: Draft) => void;
  onReset: () => void;
  onDismiss: () => void;
}) {
  const { product, baseline, packLocked: locked, status } = row;
  const savedPack = draftPack(product, baseline);
  const current = draftPack(product, draft);
  const exact = hasExactPack(current);
  const canApprove = approvalReady(product, draft);
  const multi = isMultiUnit(current.saleUnit);
  const unit = current.saleUnit && sellingUnitLabel(current.saleUnit);
  const error = draftError(product, draft);
  const proposal = suggestion && { ...baseline, ...suggestedFields(suggestion), checkoutApproved: false };
  const samePack = Boolean(proposal && packLabel(draftPack(product, proposal)) === packLabel(savedPack));
  const currentSubmission = suggestion?.version === product.version;
  const canLoad = !locked || samePack;
  const loaded = Boolean(proposal && proposal.suggestionVersion === draft.suggestionVersion);

  function changePack(change: Partial<Draft>) {
    const clearAmounts = hasExactPack(savedPack) && packLabel(current) === packLabel(savedPack);
    onChange({ ...draft, ...change, ...(clearAmounts && { price: "", stock: "" }), checkoutApproved: false, pricePublished: false });
  }

  return <article className="form-card catalogue-product" aria-labelledby={`${product.id}-name`}>
    <div className="catalogue-product-top">
      <ProductImage product={{ ...product, ...savedPack }} sizes="76px"/>
      <div>
        <p className="catalogue-product-brand">{product.brand} <span>· {categoryName(product.category)}</span></p>
        <h2 id={`${product.id}-name`}>{product.name}</h2>
        <div className="catalogue-tags">
          <span className={`admin-badge ${status === "in-stock" || status === "submitted" ? "status-confirmed" : ""}`}>{statusLabels[status]}</span>
          {changed && <span className="admin-badge catalogue-pending">Unsaved</span>}
        </div>
      </div>
    </div>

    {proposal && <div className="catalogue-submission">
      <p><b>Submitted for review</b></p>
      <p>{packLabel(draftPack(product, proposal))} · {proposal.price ? naira(Number(proposal.price)) : "Price to confirm"} · {proposal.stock ? `${proposal.stock} in stock` : "Stock to confirm"}</p>
      <div className="catalogue-review-actions">
        {canLoad && !loaded && !stale && <button className="text-link" type="button" onClick={() => {
          if (!currentSubmission && !window.confirm("The product changed after this submission. Use the submitted details with the current listing?")) return;
          onChange({
            ...proposal,
            price: proposal.price || (samePack ? baseline.price : ""),
            stock: proposal.stock || (samePack ? baseline.stock : ""),
            checkoutApproved: samePack && baseline.checkoutApproved,
            pricePublished: samePack && Boolean(baseline.pricePublished),
          });
        }}>{currentSubmission ? "Use submitted details" : "Use after checking"}</button>}
        {loaded && <span>Loaded into editor</span>}
        <button className="text-link" type="button" onClick={onDismiss}>Dismiss</button>
      </div>
      {!canLoad && <p className="catalogue-pack-note">The submitted pack differs from the confirmed listing. Review the values before making any manual edits.</p>}
      {canLoad && !currentSubmission && <p className="catalogue-pack-note">The product changed after submission. Check these details against the current listing.</p>}
    </div>}
    {stale ? <div className="catalogue-stale">
      <p>This product has newer saved details. Reload it before editing again.</p>
      <button type="button" className="text-link" onClick={onReset}>Load saved details</button>
    </div> : <>
      <details className="catalogue-pack">
        <summary>
          <span><b>Pack details</b><small>{exact ? packLabel(current) : "Set selling unit and size"}</small></span>
          <ChevronDown size={18} aria-hidden="true"/>
        </summary>
        <fieldset className="catalogue-pack-fields" disabled={locked}>
          <legend className="sr-only">Pack details for {product.name}</legend>
          <label>Selling unit
            <select value={draft.saleUnit ?? ""} onChange={(event) => changePack({
              saleUnit: sellingUnits.find((item) => item === event.target.value) ?? null,
              itemsPerUnit: "", containedUnit: null, totalSize: "",
              ...(draft.saleUnit && { price: "", stock: "" }),
            })}>
              <option value="">Choose a unit</option>
              {sellingUnits.map((item) => <option key={item} value={item}>{sellingUnitLabel(item)}</option>)}
            </select>
          </label>
          {current.saleUnit !== "bundle" && <label>{multi ? "Size of each item" : "Weight or volume"}
            <input value={draft.size} onChange={(event) => changePack({ size: event.target.value })} maxLength={35} placeholder="e.g. 500 g or 1 L"/>
          </label>}
          {multi && <>
            <label>Items per {unit}
              <input inputMode="numeric" value={draft.itemsPerUnit} onChange={(event) => changePack({ itemsPerUnit: event.target.value })} maxLength={8} placeholder="Enter count"/>
            </label>
            <label>What’s inside each {unit}?
              <select value={draft.containedUnit ?? ""} onChange={(event) => changePack({
                containedUnit: containedUnits.find((item) => item === event.target.value) ?? null,
              })}>
                <option value="">Choose an item</option>
                {containedUnits.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="catalogue-full-field">Total pack size <span className="optional">(optional)</span>
              <input value={draft.totalSize} onChange={(event) => changePack({ totalSize: event.target.value })} maxLength={35} placeholder="e.g. 20 kg"/>
            </label>
          </>}
          {current.saleUnit === "bundle" && <div className="catalogue-full-field catalogue-bundle">
            {product.bundleContents?.length ? <ul>{product.bundleContents.map((item, index) => <li key={index}>{item}</li>)}</ul> :
              <p>{shared ? "Ask Imperial staff to confirm the bundle contents." : "Add the exact bundle contents in the full product editor."}</p>}
          </div>}
        </fieldset>
        {locked && <p className="catalogue-pack-note">{shared ? "This pack is fixed. You can enter its price and stock." : "Use a new listing to sell a different pack. This pack is linked to inventory and orders."}</p>}
        {!shared && <label className="catalogue-route">Sales route
          <select value={draft.purchaseMode} onChange={(event) => {
            const purchaseMode = event.target.value;
            if (purchaseMode === "retail" || purchaseMode === "wholesale" || purchaseMode === "both" || purchaseMode === "quote") {
              onChange({ ...draft, purchaseMode, checkoutApproved: purchaseMode === "quote" ? false : draft.checkoutApproved });
            }
          }}>
            <option value="quote">Quote only</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="both">Retail and wholesale</option>
          </select>
        </label>}
      </details>

      <div className="catalogue-amounts">
        <label>Price{unit ? ` per ${unit}` : ""} (₦)
          <input inputMode="numeric" value={draft.price} onChange={(event) => onChange({ ...draft, price: event.target.value, checkoutApproved: event.target.value.trim() ? draft.checkoutApproved : false, pricePublished: event.target.value.trim() ? draft.pricePublished : false })} maxLength={12} placeholder="Enter price" aria-invalid={!validNumber(draft.price, 1, 10_000_000)}/>
        </label>
        <label>Stock{current.saleUnit ? ` (${sellingUnitLabel(current.saleUnit, 2)})` : ""}
          <input inputMode="numeric" value={draft.stock} onChange={(event) => onChange({ ...draft, stock: event.target.value, checkoutApproved: event.target.value.trim() ? draft.checkoutApproved : false })} maxLength={12} placeholder="Enter count" aria-invalid={!validNumber(draft.stock, 0, 1_000_000)}/>
        </label>
      </div>
      {(!shared || changed) && <div className="catalogue-card-actions">
        {!shared && <label className="check-label catalogue-approval">
          <input type="checkbox" checked={Boolean(draft.pricePublished)} disabled={(!draft.price.trim() || !validNumber(draft.price, 1, 10_000_000)) && !draft.pricePublished}
            onChange={(event) => onChange({ ...draft, pricePublished: event.target.checked })}/>
          Show price on quote-only listings
        </label>}
        {!shared && <label className="check-label catalogue-approval">
          <input type="checkbox" checked={draft.checkoutApproved} disabled={!canApprove && !draft.checkoutApproved}
            onChange={(event) => onChange({ ...draft, checkoutApproved: event.target.checked })}/>
          Approve for checkout
        </label>}
        {changed && <button type="button" className="text-link" onClick={onReset}>Reset</button>}
      </div>}
      {!shared && !canApprove && !error && <p className="catalogue-pack-note">Confirm the pack, sales route, price and stock to approve.</p>}
      {error && <p className="form-error">{error}</p>}
    </>}
  </article>;
}

export function StaffCatalogue({ user }: { user: User }) {
  return <CatalogueEditor user={user}/>;
}

function subscribeToHash(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

export function SharedCatalogue() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash.slice(1), () => null);
  if (hash && /^[A-Za-z0-9_-]{43}$/.test(hash)) return <CatalogueEditor key={hash} token={hash}/>;
  return <main className="catalogue-page">
    <header className="catalogue-heading">
      <h1>Submit catalogue details</h1>
      <p>Imperial Foods &amp; Beverages</p>
    </header>
    <div className="form-card">
      {hash === null ? <p role="status">Checking your link…</p> : <p>Open the full link shared with you by Imperial Foods &amp; Beverages. Ask for a fresh link if you need one.</p>}
    </div>
  </main>;
}

function CatalogueEditor({ user, token }: { user: User; token?: never } | { user?: never; token: string }) {
  const shared = Boolean(token);
  const pageSize = shared ? 30 : 12;
  const [products, setProducts] = useState<EditorRow[] | null>(null);
  const [inviteData, setInviteData] = useState<CatalogueInviteStatus>();
  const [inviteError, setInviteError] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(0);
  const savingRequest = useRef(false);
  const results = useRef<HTMLParagraphElement>(null);
  const pending = Object.values(drafts);
  const dirty = pending.length > 0;

  useEffect(() => {
    const request = new AbortController();
    const options = { signal: request.signal };
    const data = user ? staffRequest<Catalogue>(user, "catalogue", options).then(({ products }) => products.map(staffRow)) :
      sharedRequest(token, options).then(({ products }) => products.map(sharedRow));
    data.then((rows) => {
      if (request.signal.aborted) return;
      setProducts(rows);
      setConflict(false);
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setFailure(error instanceof Error ? error.message : "Couldn’t load the catalogue. Try again.");
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    if (user) staffRequest<CatalogueInviteStatus>(user, "catalogue/invite", options).then((result) => {
      if (request.signal.aborted) return;
      setInviteData(result);
      setInviteError("");
    }).catch(() => { if (!request.signal.aborted) setInviteError("Couldn’t load shared links and submissions."); });
    return () => request.abort();
  }, [user, token, revision]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const suggestions = new Map(inviteData?.suggestions.map((suggestion) => [suggestion.id, suggestion]));
  const filtered = (products ?? []).filter(({ product, baseline, status: productStatus }) =>
    (!category || product.category === category) &&
    (status !== "edited" || drafts[product.id]) &&
    (status !== "quote" || productStatus === "quote") &&
    (status !== "confirmed" || baseline.checkoutApproved) &&
    (status !== "submitted" || productStatus === "submitted" || suggestions.has(product.id)) &&
    (status !== "open" || productStatus === "open") &&
    `${product.name} ${product.brand} ${product.sku ?? product.id} ${packLabel(draftPack(product, baseline))}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pages);
  const start = (visiblePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const productById = new Map(products?.map((row) => [row.product.id, row]));
  const removed = pending.filter((draft) => !productById.has(draft.id));

  function isStale(draft: Draft) {
    const row = productById.get(draft.id);
    if (!row || row.product.version !== draft.version) return true;
    if (shared) return draft.suggestionVersion !== row.baseline.suggestionVersion;
    return Boolean(draft.suggestionVersion && draft.suggestionVersion !== suggestions.get(draft.id)?.suggestionVersion);
  }
  const staleCount = pending.filter(isStale).length;

  function updateDraft(row: EditorRow, value?: Draft) {
    setNotice("");
    setDrafts((previous) => {
      const next = { ...previous };
      if (!value || JSON.stringify(value) === JSON.stringify(row.baseline)) delete next[row.product.id];
      else next[row.product.id] = value;
      return next;
    });
  }

  async function dismiss(suggestion: CatalogueSuggestion) {
    if (!user || savingRequest.current || !window.confirm("Dismiss this submitted update?")) return;
    savingRequest.current = true;
    setSaving(true);
    setFailure("");
    try {
      const { id, suggestionVersion } = suggestion;
      await staffRequest(user, "catalogue/invite", { method: "PATCH", body: JSON.stringify({ dismiss: [{ id, suggestionVersion }] }) });
      setInviteData((current) => current && ({ ...current, suggestions: current.suggestions.filter((entry) => entry.id !== id) }));
      setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key, draft]) => key !== id || draft.suggestionVersion !== suggestionVersion)));
      setNotice("Submission dismissed.");
    } catch (error) {
      setConflict(error instanceof StaffRequestError && error.status === 409);
      setFailure(error instanceof Error ? error.message : "Couldn’t dismiss the submission.");
    } finally {
      savingRequest.current = false;
      setSaving(false);
    }
  }

  function reload() {
    setFailure("");
    setLoading(true);
    setRevision((value) => value + 1);
  }

  function goToPage(number: number) {
    setPage(number);
    results.current?.focus({ preventScroll: true });
    results.current?.scrollIntoView({ block: "start" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || staleCount || loading || conflict || savingRequest.current) return;
    setFailure("");
    setNotice("");
    const batch = pending.slice(0, 100);
    for (const draft of batch) {
      const row = productById.get(draft.id);
      if (!row) return;
      const { product } = row;
      const invalid = draftError(product, draft);
      if (invalid) {
        setFailure(`${product.name}: ${invalid}`);
        return;
      }
    }
    savingRequest.current = true;
    setSaving(true);
    try {
      const saved = user ?
        (await staffRequest<Catalogue>(user, "catalogue", {
          method: "PATCH", body: JSON.stringify({ updates: batch.map(toUpdate) }),
        })).products.map(staffRow) :
        (await sharedRequest(token, {
          method: "PATCH", body: JSON.stringify({ updates: batch.map((draft) => ({
            ...updateFields(draft), suggestionVersion: draft.suggestionVersion,
          })) }),
        })).products.map(sharedRow);
      const byId = new Map(saved.map((row) => [row.product.id, row]));
      setProducts((previous) => previous?.map((row) => byId.get(row.product.id) ?? row) ?? null);
      if (user) {
        const reviewed = new Map(batch.filter((draft) => draft.suggestionVersion && byId.has(draft.id)).map((draft) => [draft.id, draft.suggestionVersion]));
        setInviteData((current) => current && ({ ...current, suggestions: current.suggestions.filter((entry) => entry.suggestionVersion !== reviewed.get(entry.id)) }));
      }
      setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !byId.has(id))));
      setConflict(false);
      const remaining = pending.length - saved.length;
      setNotice(`Saved ${saved.length} ${saved.length === 1 ? "product" : "products"}${shared ? " for review" : ""}.${remaining ? ` ${remaining} still unsaved.` : ""}`);
    } catch (error) {
      setConflict(error instanceof StaffRequestError && error.status === 409);
      setFailure(error instanceof Error ? error.message : "Couldn’t save your changes. Try again.");
    } finally {
      savingRequest.current = false;
      setSaving(false);
    }
  }

  return <main className="catalogue-page">
    <div className="catalogue-top">
      {!shared && <Link href="/admin" className="text-link" onNavigate={(event) => {
        if (saving || (dirty && !window.confirm("Leave without saving your catalogue changes?"))) event.preventDefault();
      }}><ArrowLeft size={16}/> Dashboard</Link>}
      <span>Imperial Foods &amp; Beverages</span>
    </div>
    <header className="catalogue-heading">
      <h1>{shared ? "Submit catalogue details" : "Update catalogue"}</h1>
      <p>Enter the pack size, price and stock for each product you know. Use 0 when it’s out of stock and leave unknown values blank. {shared ? "Imperial staff will review what you submit." : "You can save details before approving checkout."}</p>
    </header>

    {user && <CatalogueShare user={user} invite={inviteData?.invite} disabled={saving || loading}
      onInviteChange={(invite) => setInviteData((current) => ({ invite, suggestions: current?.suggestions ?? [] }))}/>}
    {inviteError && <p className="inline-notice" role="status">{inviteError}</p>}
    {user && products && <div className="catalogue-review-summary">
      <button className="text-link" type="button" disabled={saving || loading} onClick={() => {
        setStatus("submitted"); setCategory(""); setQuery(""); setPage(1); reload();
      }}>Review submissions{suggestions.size > 0 ? ` (${suggestions.size})` : ""}</button>
      <button className="text-link" type="button" disabled={saving || loading} onClick={reload}>Refresh catalogue</button>
    </div>}
    {products === null ? <div className="form-card">
      {loading ? <p role="status">Loading products…</p> : <>
        <p className="form-error" role="alert">{failure}</p>
        <button className="button button-outline mt-3" type="button" onClick={reload}>Try again</button>
      </>}
    </div> : <>
      <fieldset className="catalogue-filters" disabled={saving}>
        <legend className="sr-only">Find products</legend>
        <label>Search products
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, brand or SKU"/>
        </label>
        <label>Category
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All products</option>
            {shared ? <>
              <option value="open">To fill</option>
              <option value="submitted">Submitted</option>
            </> : <>
              <option value="quote">Quote only</option>
              <option value="confirmed">Confirmed</option>
              <option value="submitted">Submitted for review{suggestions.size > 0 ? ` (${suggestions.size})` : ""}</option>
            </>}
            <option value="edited">Unsaved</option>
          </select>
        </label>
      </fieldset>
      <form onSubmit={save} noValidate>
        <div className="catalogue-savebar">
          <div className="catalogue-savebar-row">
            <p role="status">{notice ? <><Check size={17} aria-hidden="true"/> {notice}</> : dirty ? `${pending.length} unsaved ${pending.length === 1 ? "product" : "products"}` : "No unsaved changes"}</p>
            <button className="button button-green" type="submit" disabled={!dirty || saving || loading || conflict || staleCount > 0}>
              <Save size={17} aria-hidden="true"/> {saving ? "Saving…" : shared ? "Save for review" : "Save changes"}
            </button>
          </div>
          {failure && <p className="form-error" role="alert">{failure}</p>}
          {conflict && <button type="button" className="text-link" disabled={loading} onClick={reload}>{loading ? "Checking…" : "Check for newer changes"}</button>}
          {staleCount > 0 && <p className="form-error" role="status">Review {staleCount} changed {staleCount === 1 ? "product" : "products"}. Choose Unsaved in the status filter to find them.</p>}
          {removed.length > 0 && <button type="button" className="text-link" onClick={() => setDrafts((previous) => {
            const next = { ...previous };
            removed.forEach(({ id }) => { delete next[id]; });
            return next;
          })}>Clear edits for removed products</button>}
        </div>
        <p ref={results} tabIndex={-1} className="catalogue-results" aria-live="polite">
          {visible.length ? `Showing ${start + 1}–${start + visible.length} of ${filtered.length} matching products` : "No matching products"} · {products.length} in catalogue
        </p>
        {visible.length ? <fieldset className="catalogue-cards" disabled={saving || loading}>
          <legend className="sr-only">Update product details</legend>
          {visible.map((row) => {
            const id = row.product.id;
            const draft = drafts[id];
            const suggestion = suggestions.get(id);
            return <ProductFields key={id} row={row} shared={shared} suggestion={suggestion}
              draft={draft ?? row.baseline} stale={Boolean(draft && isStale(draft))} changed={Boolean(draft)}
              onChange={(next) => updateDraft(row, next)} onReset={() => updateDraft(row)}
              onDismiss={() => { if (suggestion) void dismiss(suggestion); }}/>;
          })}
        </fieldset> : <div className="form-card">
          <p>{status === "edited" && !dirty ? "Your unsaved edits will appear here." :
            status === "submitted" && !shared && !suggestions.size ? "Submitted updates will appear here." : "Try a different search or clear your filters."}</p>
          <button className="text-link mt-2" type="button" onClick={() => { setQuery(""); setCategory(""); setStatus("all"); setPage(1); }}>Clear filters</button>
        </div>}
        {pages > 1 && <nav className="catalogue-pagination" aria-label="Catalogue pages">
          <button className="button button-outline" type="button" disabled={visiblePage === 1 || saving} onClick={() => goToPage(visiblePage - 1)}><ChevronLeft size={17}/> Previous</button>
          <span>Page {visiblePage} of {pages}</span>
          <button className="button button-outline" type="button" disabled={visiblePage === pages || saving} onClick={() => goToPage(visiblePage + 1)}>Next <ChevronRight size={17}/></button>
        </nav>}
      </form>
    </>}
  </main>;
}
