"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { ArrowLeft, ArrowRight, ArrowUpRight, Boxes, Building2, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Package, Plus, RefreshCw, Search, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { canCheckoutProduct, categoryName, packLabel, productAvailability, deliveryZones, naira, nextStatuses, onlinePaymentLabel, paymentProviderName, statusLabel, type Order, type OrderStatus, type Product } from "@/lib/commerce";
import type { InventoryEvent, ProductRecord } from "@/lib/store-server";
import { staffRequest as api } from "@/lib/admin-client";
import { staffAuth, staffConfigured } from "@/lib/firebase-client";
import type { WholesalePage, WholesaleQuoteInput, WholesaleRequest } from "@/lib/validation";
import { wholesaleStatusLabel, type WholesaleStatus } from "@/lib/wholesale";
import { fulfilmentStatusLabel, orderOperationsMode, reliableFulfilment } from "@/lib/order-operations";
import { Brand } from "./brand";
import { ProductImage } from "./product-image";
import { ProductEditor } from "./product-editor";
import { WholesaleDetails } from "./admin-wholesale";
import { DeliveryOperations } from "./delivery-operations";
import { BusinessOperations } from "./business-operations";
import { StaffCatalogue } from "./staff-catalogue";

type Tab = "overview" | "orders" | "products" | "wholesale" | "delivery" | "business";
type ProductData = { products: ProductRecord[]; inventoryEvents: InventoryEvent[] };
type DashboardData = ProductData & { orders: Order[]; next: string | null };
type Access = { user: User | null; loading: boolean };

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

export function Admin({ demoEnvironment, view = "dashboard" }: { demoEnvironment: boolean; view?: "dashboard" | "catalogue" }) {
  const [access, setAccess] = useState<Access>({ user: null, loading: staffConfigured });
  const [failure, setFailure] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!staffConfigured) return;
    let active = true;
    try {
      const stop = onAuthStateChanged(staffAuth(), (user) => setAccess({ user, loading: false }));
      return () => { active = false; stop(); };
    } catch {
      queueMicrotask(() => {
        if (active) { setFailure("Staff sign-in configuration is invalid."); setAccess({ user: null, loading: false }); }
      });
      return () => { active = false; };
    }
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setFailure("");
    setResetNotice("");
    if (resetting) {
      try {
        await sendPasswordResetEmail(staffAuth(), String(form.get("email")).trim());
        setResetNotice("If this email has staff access, check your inbox for a password reset link.");
      } catch {
        setFailure("We couldn’t request a reset right now. Try again shortly.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try { await signInWithEmailAndPassword(staffAuth(), String(form.get("email")), String(form.get("password"))); }
    catch { setFailure("We couldn’t sign you in. Check your email and password, then try again."); }
    finally { setSubmitting(false); }
  }

  if (access.user && view === "catalogue") return <StaffCatalogue key={access.user.uid} user={access.user}/>;
  if (access.user) return <Dashboard key={access.user.uid} user={access.user} demoEnvironment={demoEnvironment}/>;
  return <main className="admin-login">
    <div className="admin-login-brand"><Brand/><Link className="text-link" href="/"><ArrowLeft size={17}/> Back to the store</Link></div>
    <div className="form-card login-card">
      <span className="benefit-icon"><ShieldCheck size={26}/></span><span className="eyebrow">IMPERIAL STAFF</span><h1>{view === "catalogue" ? "Update catalogue" : "Store dashboard"}</h1><p>{view === "catalogue" ? "Sign in to update pack sizes, prices and stock." : "Sign in to manage orders, products and stock."}</p>
      {access.loading ? <p role="status">Checking your session…</p> : staffConfigured ? <form onSubmit={login}>
        <label>Work email<input type="email" name="email" autoComplete="username" required maxLength={150}/></label>
        {!resetting && <label>Password<input type="password" name="password" autoComplete="current-password" required/></label>}
        {failure && <p className="form-error" role="alert">{failure}</p>}
        {resetNotice && <p className="inline-notice" role="status">{resetNotice}</p>}
        <button className="button button-green" type="submit" disabled={submitting}>{resetting ? (submitting ? "Sending…" : "Send reset link") : (submitting ? "Signing in…" : "Sign in")} <ArrowRight size={19}/></button>
        <button className="text-link mt-3" type="button" disabled={submitting} onClick={() => {
          setResetting(!resetting);
          setFailure("");
          setResetNotice("");
        }}>{resetting ? "Back to sign in" : "Set or reset password"}</button>
      </form> : <p className="inline-notice">Staff sign-in is not configured yet.</p>}
    </div>
  </main>;
}

const date = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

function inventorySource(event: InventoryEvent) {
  if (!event.staffId) return event.simulated ? "Simulated order" : "Order";
  if (!event.orderId) return "Staff adjustment";
  return event.simulated ? "Test order cancellation" : "Order cancellation";
}

function Status({ status }: { status: OrderStatus }) {
  return <span className={`admin-badge status-${status}`}>{statusLabel[status]}</span>;
}

function OrderDetails({ order, busy, onUpdate, onCheckPayment, demoEnvironment }: {
  order: Order; busy: boolean; demoEnvironment: boolean; onUpdate: (id: string, status: OrderStatus) => void; onCheckPayment: (id: string) => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const mode = orderOperationsMode(order, demoEnvironment);
  const paymentAllowsUpdate = !order.payment || order.payment.status === "paid";
  const canFulfil = paymentAllowsUpdate && mode === "normal";
  const canCancel = paymentAllowsUpdate && nextStatuses[order.status].includes("cancelled");
  return <details className="admin-order">
    <summary>
      <div><strong>{order.customer.name}</strong><small>{order.id}{mode === "simulated" && " · Simulated order"}</small></div>
      <time dateTime={order.createdAt}>{date.format(new Date(order.createdAt))}</time>
      <Status status={order.status}/><b>{naira(order.total)}</b><ChevronDown size={17}/>
    </summary>
    <div className="admin-order-body">
      <div><h3>Delivery details</h3><p>{order.customer.address}</p><p>{deliveryZones.find((entry) => entry.id === order.customer.zone)?.name}</p>
        <p><a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></p>
        {order.customer.email && <p>{order.customer.email}</p>}
        {order.customer.notes && <p>Note: {order.customer.notes}</p>}
      </div>
      <div><h3>Order items</h3>{order.items.map((item) => <p className="summary-line" key={item.productId}><span>{item.quantity} × {item.name} · {item.size}</span><b>{naira(item.price * item.quantity)}</b></p>)}
        <div className="summary-line"><span>Delivery</span><b>{order.shipping ? naira(order.shipping) : "Free"}</b></div>
        <div className="summary-line"><span>{mode === "simulated" ? "Simulated total" : mode === "unconfirmed" ? "Payment environment unconfirmed" : order.payment ? onlinePaymentLabel[order.payment.status] : "Pay on delivery"}</span><b>{naira(order.total)}</b></div>
      </div>
      {mode !== "normal" && <p className="inline-notice field-wide">{mode === "simulated" ? "Simulated order. Dispatch is disabled." : "The original payment environment could not be verified. Dispatch is disabled."}</p>}
      {!!order.fulfilmentEvents?.length && <div className="field-wide"><h3>Fulfilment history</h3>
        <ul>{order.fulfilmentEvents.map((event) => <li key={`${event.status}-${event.at}`} className="summary-line">
          <span>{fulfilmentStatusLabel[event.status]}{event.staffId && <small className="block muted break-all">Staff ID {event.staffId}</small>}</span>
          <time dateTime={event.at}>{date.format(new Date(event.at))}</time>
        </li>)}</ul>
      </div>}
      {order.payment?.checkoutId && <div className="order-actions">
        <button className="button button-outline" type="button" disabled={busy} onClick={() => onCheckPayment(order.id)}>Refresh payment</button>
        {mode === "normal" && order.payment.status === "refund_required" && <p className="muted">Issue the refund in {paymentProviderName(order.payment.provider)} using this order reference, then refresh the payment here.</p>}
      </div>}
      {(canCancel || (canFulfil && nextStatuses[order.status].length > 0)) && <div className="order-actions">
        {canFulfil && nextStatuses[order.status].filter((status) => status !== "cancelled").map((status) => <button className="button button-green" key={status} type="button" disabled={busy} onClick={() => onUpdate(order.id, status)}>Mark {fulfilmentStatusLabel[status].toLowerCase()}</button>)}
        {canCancel && <button className="button button-outline danger" type="button" disabled={busy} onClick={() => {
          if (confirmCancel) { onUpdate(order.id, "cancelled"); setConfirmCancel(false); } else setConfirmCancel(true);
        }}>{confirmCancel ? (order.payment && mode === "normal" ? "Cancel and flag for refund" : "Confirm cancellation") : "Cancel order"}</button>}
        {confirmCancel && <button className="text-link" type="button" onClick={() => setConfirmCancel(false)}>Keep order</button>}
      </div>}
    </div>
  </details>;
}

function Dashboard({ user, demoEnvironment }: { user: User; demoEnvironment: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [wholesale, setWholesale] = useState<WholesalePage | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [product, setProduct] = useState<ProductRecord | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const options = { signal: request.signal };
    Promise.all([api<ProductData>(user, "products", options), api<{ orders: Order[]; next: string | null }>(user, "orders", options)])
      .then(([catalog, orders]) => { if (!request.signal.aborted) setData({ ...catalog, ...orders }); })
      .catch((error: unknown) => { if (!request.signal.aborted) setError(message(error, "Dashboard data is unavailable.")); });
    return () => request.abort();
  }, [user, revision]);

  useEffect(() => {
    if (tab !== "wholesale") return;
    const request = new AbortController();
    api<WholesalePage>(user, "wholesale", { signal: request.signal })
      .then((page) => { if (!request.signal.aborted) setWholesale(page); })
      .catch((error: unknown) => { if (!request.signal.aborted) setError(message(error, "Wholesale requests are unavailable.")); });
    return () => request.abort();
  }, [user, tab, revision]);

  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (error) { setError(message(error, "The change couldn’t be completed.")); }
    finally { setBusy(false); }
  }

  const refresh = () => { setData(null); setWholesale(null); setError(""); setNotice(""); setProduct(null); setRevision((value) => value + 1); };
  function navigate(next: Tab) { setTab(next); setProduct(null); setNotice(""); setQuery(""); }
  const updateStatus = (id: string, status: OrderStatus) => void run(async () => {
    const { order } = await api<{ order: Order }>(user, "orders", { method: "PATCH", body: JSON.stringify({ id, status }) });
    setData((old) => old && ({ ...old, orders: old.orders.map((entry) => entry.id === id ? order : entry) }));
    setNotice(`Order updated: ${statusLabel[status]}.`);
    if (status === "cancelled") {
      const result = await api<ProductData>(user, "products");
      setData((old) => old && ({ ...old, ...result }));
    }
  });
  const checkPayment = (id: string) => void run(async () => {
    const { order } = await api<{ order: Order }>(user, "payments", { method: "POST", body: JSON.stringify({ id }) });
    setData((old) => old && ({ ...old, orders: old.orders.map((entry) => entry.id === id ? order : entry) }));
    setNotice(order.payment ? onlinePaymentLabel[order.payment.status] : "Payment checked.");
    const result = await api<ProductData>(user, "products");
    setData((old) => old && ({ ...old, ...result }));
  });
  const updateWholesale = (id: string, status: WholesaleStatus) => void run(async () => {
    const { request } = await api<{ request: WholesaleRequest }>(user, "wholesale", {
      method: "PATCH", body: JSON.stringify({ id, status }),
    });
    setWholesale((page) => page && ({ ...page, requests: page.requests.map((entry) => entry.id === id ? request : entry) }));
    setNotice(`Request marked ${wholesaleStatusLabel[status].toLowerCase()}.`);
  });
  const saveWholesaleQuote = (id: string, quote: WholesaleQuoteInput, previousQuoteAt: string | null) => void run(async () => {
    const { request } = await api<{ request: WholesaleRequest }>(user, "wholesale", {
      method: "PATCH", body: JSON.stringify({ id, quote, previousQuoteAt }),
    });
    setWholesale((page) => page && ({ ...page, requests: page.requests.map((entry) => entry.id === id ? request : entry) }));
    setNotice("Quotation saved. Share it with the customer through an agreed contact channel.");
  });
  function saveProduct(value: Product, version: string | null) {
    void run(async () => {
      await api(user, "products", { method: "PUT", body: JSON.stringify({ product: value, version }) });
      setProduct(null);
      setNotice("Product saved.");
      const result = await api<ProductData>(user, "products");
      setData((old) => old && ({ ...old, ...result }));
    });
  }

  const orders = data?.orders ?? [];
  const products = data?.products ?? [];
  const low = products.filter((entry) => entry.active && canCheckoutProduct(entry) && entry.stock <= 5);
  const filteredProducts = products.filter((entry) => `${entry.name} ${entry.brand} ${entry.sku ?? entry.id} ${packLabel(entry)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filteredOrders = orders.filter((entry) => filter === "all" || entry.status === filter);
  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "orders", label: "Orders", icon: ClipboardList },
    { id: "products", label: "Products", icon: Boxes }, { id: "wholesale", label: "Wholesale", icon: Warehouse },
    { id: "delivery", label: "Delivery", icon: Truck }, { id: "business", label: "Business", icon: Building2 },
  ] as const;

  return <div className="admin-shell">
    <aside className="admin-sidebar"><Brand inverse/><span className="admin-label">STORE MANAGEMENT</span>
      <nav aria-label="Dashboard">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => navigate(id)} disabled={busy}><Icon size={19}/>{label}</button>)}</nav>
      <div className="admin-sidebar-foot"><Link href="/"><ArrowUpRight size={19}/> View storefront</Link>
        <button type="button" onClick={() => void run(async () => { await signOut(staffAuth()); })} disabled={busy}><LogOut size={19}/> Sign out</button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-header"><div><span className="eyebrow">IMPERIAL STAFF</span><h1>{tabs.find((entry) => entry.id === tab)?.label}</h1></div>
        <button className="button button-outline" type="button" onClick={refresh} disabled={busy}><RefreshCw size={17}/> Refresh</button></header>
      {error && <p className="inline-notice form-error" role="alert">{error}</p>}
      {notice && <p className="inline-notice" role="status">{notice}</p>}
      {tab !== "business" && tab !== "delivery" && !(tab === "wholesale" ? wholesale : data) && !error && <p role="status">Loading {tab === "wholesale" ? "wholesale requests" : "your store"}…</p>}
      {tab === "delivery" && <DeliveryOperations key={revision} user={user}/>}
      {tab === "business" && <BusinessOperations key={revision} user={user}/>}

      {data && tab === "overview" && <>
        <div className="stat-grid">
          <div><span>Orders loaded</span><strong>{orders.length}</strong><small>Most recent orders</small></div>
          <div><span>Awaiting confirmation</span><strong>{orders.filter((entry) => entry.status === "placed" && reliableFulfilment(entry, demoEnvironment) && (!entry.payment || entry.payment.status === "paid")).length}</strong><small>Among loaded orders</small></div>
          <div><span>Active products</span><strong>{products.filter((entry) => entry.active).length}</strong><small>{low.length} low on stock</small></div>
        </div>
        <section className="admin-section"><div className="admin-section-head"><h2>Recent orders</h2><button className="text-link" type="button" onClick={() => navigate("orders")}>View orders <ArrowRight size={16}/></button></div>
          {orders.length === 0 ? <p className="muted">Orders will appear here after checkout.</p> : orders.slice(0, 5).map((entry) => <OrderDetails key={entry.id} order={entry} busy={busy} onUpdate={updateStatus} onCheckPayment={checkPayment} demoEnvironment={demoEnvironment}/>)}
        </section>
        {low.length > 0 && <section className="admin-section"><div className="admin-section-head"><h2>Low stock</h2><button className="text-link" type="button" onClick={() => navigate("products")}>Manage products <ArrowRight size={16}/></button></div>
          {low.map((entry) => <div className="summary-line" key={entry.id}><span>{entry.name}</span><b>{entry.stock} left</b></div>)}
        </section>}
      </>}

      {data && tab === "orders" && <section className="admin-section">
        <div className="admin-section-head"><h2>Order queue</h2><label className="admin-filter">Filter <select value={filter} onChange={(event) => setFilter(event.target.value as OrderStatus | "all")}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>
        {filteredOrders.length === 0 ? <p className="muted">No matching orders in the loaded results.</p> : filteredOrders.map((entry) => <OrderDetails key={entry.id} order={entry} busy={busy} onUpdate={updateStatus} onCheckPayment={checkPayment} demoEnvironment={demoEnvironment}/>)}
        {data.next && <button className="button button-outline load-more" type="button" disabled={busy} onClick={() => void run(async () => {
          const next = await api<{ orders: Order[]; next: string | null }>(user, `orders?after=${encodeURIComponent(data.next ?? "")}`);
          setData((old) => old && ({ ...old, next: next.next, orders: [...old.orders, ...next.orders.filter((entry) => !old.orders.some((previous) => previous.id === entry.id))] }));
        })}>Load more orders</button>}
      </section>}

      {tab === "wholesale" && wholesale && <section className="admin-section">
        <div className="admin-section-head"><h2>Quote requests</h2></div>
        {wholesale.requests.length === 0 ? <p className="muted">No wholesale requests yet.</p> : wholesale.requests.map((entry) =>
          <WholesaleDetails key={entry.id} request={entry} busy={busy} onUpdate={updateWholesale} onQuote={saveWholesaleQuote}/>
        )}
        {wholesale.next && <button className="button button-outline load-more" type="button" disabled={busy} onClick={() => void run(async () => {
          const page = await api<WholesalePage>(user, `wholesale?after=${encodeURIComponent(wholesale.next ?? "")}`);
          setWholesale((previous) => previous && ({ next: page.next, requests: [...previous.requests, ...page.requests] }));
        })}>Load more requests</button>}
      </section>}

      {data && tab === "products" && <>
        {product && <ProductEditor key={product === "new" ? "new" : product.id} record={product} onClose={() => setProduct(null)} save={saveProduct} busy={busy}/>}
        <section className="admin-section">
          <div className="admin-section-head"><h2>Catalogue inventory</h2><div className="flex flex-wrap gap-2">
            <Link className="button button-outline" href="/admin/catalogue">Update prices, packs &amp; stock</Link>
            <button className="button button-green" type="button" onClick={() => { setProduct("new"); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={busy}><Plus size={18}/> Add product</button>
          </div></div>
          <label className="admin-search"><Search size={18}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search inventory" placeholder="Search name or brand"/></label>
          {filteredProducts.length === 0 ? <p className="muted">No products match your search.</p> : <div className="inventory-scroll"><table className="inventory-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filteredProducts.map((entry) => <tr key={entry.id}><td><div className="inventory-product"><ProductImage product={entry} sizes="48px"/><span>{entry.name}<small>{packLabel(entry)} · {entry.sku ?? entry.id}</small></span></div></td>
              <td>{categoryName(entry.category)}</td><td>{canCheckoutProduct(entry) && entry.price !== null ? naira(entry.price) : "On request"}</td><td>{entry.stockVerified ? entry.stock : "Unconfirmed"}</td><td><span className={`admin-badge ${entry.active && productAvailability(entry) === "in-stock" ? "status-confirmed" : ""}`}>{!entry.active ? "Draft" : productAvailability(entry) === "quote" ? "Quote only" : productAvailability(entry) === "out-of-stock" ? "Out of stock" : "In stock"}</span></td>
              <td><button className="text-link" type="button" onClick={() => { setProduct(entry); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={busy} aria-label={`Edit ${entry.name}`}>Edit</button></td></tr>)}</tbody></table></div>}
        </section>
        <section className="admin-section">
          <div className="admin-section-head"><h2>Recent inventory changes</h2></div>
          {data.inventoryEvents.length === 0 ? <p className="muted">No recorded changes yet.</p> : <div className="inventory-scroll"><table className="inventory-table">
            <thead><tr><th>Product</th><th>Selling unit</th><th>Before</th><th>After</th><th>Source</th><th>Recorded</th></tr></thead>
            <tbody>{data.inventoryEvents.map((event) => <tr key={event.id}>
              <td>{event.name}</td><td>{event.unit}</td><td>{event.from ?? "Unconfirmed"}</td><td>{event.to ?? "Unconfirmed"}</td>
              <td>{inventorySource(event)}</td>
              <td><time dateTime={event.at}>{date.format(new Date(event.at))}</time></td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </>}
      <div className="admin-bottom"><Package size={16}/> Imperial Foods &amp; Beverages</div>
    </main>
  </div>;
}
