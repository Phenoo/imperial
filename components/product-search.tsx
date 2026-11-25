"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { categories, packLabel } from "@/lib/commerce";
import { productMatches, readShopFilters, searchText, shopHref } from "@/lib/catalog-search";
import { recordShopEvent } from "@/lib/shop-analytics";
import { useShop } from "./shop-context";

export function ProductSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/shop" ? readShopFilters((key) => params.get(key)) : undefined;
  return <SearchField key={current?.q ?? ""} current={current}/>;
}

function SearchField({ current }: { current: ReturnType<typeof readShopFilters> | undefined }) {
  const { catalog } = useShop();
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState(current?.q ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const normalized = searchText(query.trim());
  const tokens = normalized.split(/\s+/);
  const suggestions = normalized.length < 2 ? [] : [
    ...categories.filter((category) => searchText(category.name).includes(normalized)).slice(0, 2).map(({ id, name }) => ({
      title: name, description: "Category", href: shopHref({ category: id }),
    })),
    ...[...new Set(catalog.map(({ brand }) => brand))].filter((brand) => searchText(brand).startsWith(normalized)).slice(0, 2).map((brand) => ({
      title: brand, description: "Brand", href: shopHref({ brand }),
    })),
    ...catalog.filter((product) => productMatches(product, tokens)).slice(0, 5).map((product) => ({
      title: product.name, description: packLabel(product), href: `/products/${product.id}`,
    })),
  ].slice(0, 7);
  const visible = open && suggestions.length > 0;

  function navigate(href: string) {
    setOpen(false);
    setActive(-1);
    router.push(href);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visible && suggestions[active]) {
      recordShopEvent("search");
      navigate(suggestions[active].href);
      return;
    }
    navigate(shopHref({ ...current, q: query.trim() }));
  }
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && visible) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index < 0 ? (direction === 1 ? 0 : suggestions.length - 1) : (index + direction + suggestions.length) % suggestions.length));
    }
  }

  return <form className="store-search" action="/shop" role="search" onSubmit={submit}>
    <Search size={20} aria-hidden="true"/>
    <label className="sr-only" htmlFor={id}>Search products</label>
    <input id={id} name="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded={visible}
      aria-controls={visible ? `${id}-suggestions` : undefined}
      aria-activedescendant={visible && active >= 0 ? `${id}-option-${active}` : undefined}
      placeholder="Search food, brands or pack sizes" autoComplete="off" enterKeyHint="search" maxLength={100} value={query}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onKeyDown={keys} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
    />
    <button className="store-search-submit" type="submit" aria-label="Submit search"><ArrowRight size={19} aria-hidden="true"/></button>
    {visible && <div className="search-suggestions" id={`${id}-suggestions`} role="listbox" aria-label="Product search suggestions">
      {suggestions.map((suggestion, index) => <button
        type="button" role="option" aria-selected={index === active} id={`${id}-option-${index}`} key={suggestion.href} tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()} onClick={() => { recordShopEvent("search"); navigate(suggestion.href); }}
      >
        <strong>{suggestion.title}</strong><small>{suggestion.description}</small>
      </button>)}
    </div>}
  </form>;
}
