"use client";

import { useState, type FormEvent } from "react";
import { naira, packLabel, productLimit, sellingUnitLabel } from "@/lib/commerce";
import { useShop, type SavedList } from "./shop-context";

export function SaveBasketList() {
  const { saveBasketList, lists } = useShop();
  const [name, setName] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveBasketList(name)) setName("");
  }
  return <details className="mt-3">
    <summary className="py-2 font-bold">Save this basket as a shopping list</summary>
    {lists.length >= 12 ? <p className="muted text-sm">Remove an older list from Saved before adding another.</p>
      : <form className="form-card" onSubmit={submit}>
        <label>List name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={44} required/></label>
        <button className="button button-outline mt-2" type="submit" disabled={!name.trim()}>Save list</button>
      </form>}
  </details>;
}

function ShoppingList({ list }: { list: SavedList }) {
  const shop = useShop();
  const [error, setError] = useState("");
  const rows = Object.entries(list.items).map(([id, quantity]) => ({
    id, quantity, product: shop.catalog.find((entry) => entry.id === id),
  }));
  const available = rows.flatMap(({ product, quantity }) => product?.price != null && productLimit(product) >= quantity &&
    quantity >= (product.minimumQuantity ?? 1) ? [{ product, quantity }] : []);
  return <details className="border-b border-[var(--line)] py-2">
    <summary className="py-2 font-bold">{list.name} · {rows.length} {rows.length === 1 ? "product" : "products"}</summary>
    <ul className="mb-3 space-y-2 text-sm">
      {rows.map(({ id, product, quantity }) => <li key={id}>
        <strong>{product?.name ?? "Product no longer listed"}</strong>
        {product && <p className="muted">{quantity} {sellingUnitLabel(product.saleUnit, quantity)} · {packLabel(product)}</p>}
        {product && available.some((entry) => entry.product.id === id) && product.price !== null
          ? <p>{naira(product.price * quantity)}</p>
          : <p className="muted">Unavailable for this quantity or requires a quote</p>}
      </li>)}
    </ul>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="button button-outline" disabled={!available.length} onClick={() => {
        if (shop.addReorder(available)) {
          shop.setPanel("cart");
          return;
        }
        setError("The current basket or stock limits prevent adding this list. Review your basket and try again.");
      }}>Add available items</button>
      <button type="button" className="text-link" onClick={() => shop.deleteList(list.id)}>Remove list</button>
    </div>
  </details>;
}

export function ShoppingLists() {
  const { lists } = useShop();
  if (!lists.length) return null;
  return <section aria-label="Your shopping lists" className="mb-4">
    <h3 className="text-lg font-extrabold">Shopping lists</h3>
    <p className="muted text-sm">Review current prices and availability before adding a list.</p>
    {lists.map((list) => <ShoppingList key={list.id} list={list}/>)}
  </section>;
}
