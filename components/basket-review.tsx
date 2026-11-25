"use client";

import { naira, packLabel } from "@/lib/commerce";
import { useShop } from "./shop-context";

export function BasketReview() {
  const { changes, unavailableCount, acknowledgeChanges, pruneUnavailable } = useShop();
  return <>
    {unavailableCount > 0 && <div className="inline-notice" role="status">
      <p>{unavailableCount === 1 ? "One item now requires a quote or is no longer available." : `${unavailableCount} items now require a quote or are no longer available.`}</p>
      <button type="button" className="text-link" onClick={pruneUnavailable}>Remove from basket</button>
    </div>}
    {changes.length > 0 && <div className="inline-notice" role="status">
      <p className="font-bold">Review the current prices and pack sizes</p>
      <ul className="my-2 space-y-1">
        {changes.map(({ product, prior }) => <li key={product.id}>
          {product.name}. {prior ? <>Previously {naira(prior.price)} · {prior.pack}. </> : null}
          Now {naira(product.price)} · {packLabel(product)}.
        </li>)}
      </ul>
      <button type="button" className="text-link" onClick={acknowledgeChanges}>Accept current prices and packs</button>
    </div>}
  </>;
}
