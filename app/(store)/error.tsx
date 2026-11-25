"use client";

export default function ShopError({ reset }: { reset: () => void }) {
  return <div className="shell subpage empty-state"><h1>Something didn’t load.</h1><p>Try refreshing the page.</p><button className="button button-green" type="button" onClick={reset}>Try again</button></div>;
}
