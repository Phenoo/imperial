"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
import { categories, naira, type Product } from "@/lib/commerce";
import { filterProducts, readShopFilters, shopHref, sortOptions, type ShopFilters } from "@/lib/catalog-search";
import { recordShopEvent } from "@/lib/shop-analytics";
import { ProductCard } from "./product-card";

export function ProductGrid({ products }: { products: Product[] }) {
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>;
}

const unitOptions = [["single", "Individual items"], ["pack", "Packs"], ["bulk", "Cases and cartons"]] as const;
const availabilityOptions = [["in-stock", "In stock"], ["out-of-stock", "Out of stock"], ["quote", "Availability on enquiry"]] as const;
const purchaseOptions = [["checkout", "Available for checkout"], ["quote", "Quote only"], ["wholesale", "Wholesale and quote"], ["retail", "Retail packs and items"]] as const;
const categoryOptions = categories.map(({ id, name }) => [id, name] as const);
type FilterOption = readonly [string, string];

function FilterSelect({ name, label, all, value, options }: {
  name: keyof ShopFilters; label: string; all: string; value: string; options: readonly FilterOption[];
}) {
  return <label>{label}<select name={name} defaultValue={value}>
    <option value="">{all}</option>
    {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}

export function ShopCatalog({ products, filters }: { products: Product[]; filters: ShopFilters }) {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const lastSearch = useRef("");
  const matches = filterProducts(products, filters);
  const brands = [...new Set(products.map(({ brand }) => brand))].sort();
  const sizes = [...new Set(products.map(({ size }) => size).filter(Boolean))]
    .filter((size) => !/sample|^carton$/i.test(size))
    .sort((a, b) => a.localeCompare(b, "en-NG", { numeric: true }));
  const currentHref = shopHref(filters);
  const optionLabel = (value: string, options: readonly FilterOption[]) => options.find(([id]) => id === value)?.[1];
  const chips: [keyof ShopFilters, string | undefined][] = [
    ["q", filters.q ? `Search: ${filters.q}` : undefined],
    ["category", optionLabel(filters.category, categoryOptions)],
    ["brand", filters.brand],
    ["size", filters.size],
    ["unit", optionLabel(filters.unit, unitOptions)],
    ["availability", optionLabel(filters.availability, availabilityOptions)],
    ["purchase", optionLabel(filters.purchase, purchaseOptions)],
    ["min", filters.min ? `From ${naira(Number(filters.min))}` : undefined],
    ["max", filters.max ? `Up to ${naira(Number(filters.max))}` : undefined],
  ];
  const applied = chips.filter(([, label]) => label);
  useEffect(() => {
    if (!filters.q) {
      lastSearch.current = "";
      return;
    }
    if (lastSearch.current === currentHref) return;
    lastSearch.current = currentHref;
    recordShopEvent("search");
    if (matches.length === 0) recordShopEvent("search_no_results");
  }, [currentHref, filters.q, matches.length]);

  function navigate(next: ShopFilters) {
    setFormError("");
    recordShopEvent("filter_apply");
    router.push(shopHref(next));
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pending = readShopFilters((key) => form.get(key) ?? filters[key]);
    if (pending.min && pending.max && Number(pending.min) > Number(pending.max)) {
      setFormError("Enter a maximum price at least as high as the minimum.");
      return;
    }
    navigate(pending);
  }

  return <>
    <div className="catalog-toolbar">
      <p role="status">{matches.length} {matches.length === 1 ? "product" : "products"}{filters.q && <> for “{filters.q}”</>}</p>
      <div className="catalog-controls">
        <label>Category<select value={filters.category} onChange={(event) => navigate({ ...filters, category: event.currentTarget.value })}>
          <option value="">All categories</option>
          {categoryOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Sort by<select value={filters.sort} onChange={(event) => navigate({ ...filters, sort: event.currentTarget.value })}>
          {sortOptions.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
        </select></label>
      </div>
    </div>
    <details className="form-card mb-4">
      <summary className="flex min-h-10 items-center gap-2 font-bold"><SlidersHorizontal size={18} aria-hidden="true"/> More filters</summary>
      <form key={currentHref} action="/shop" onSubmit={apply}>
        <input type="hidden" name="q" value={filters.q}/>
        <input type="hidden" name="category" value={filters.category}/>
        <input type="hidden" name="sort" value={filters.sort}/>
        <div className="form-grid mt-3">
          <FilterSelect name="brand" label="Brand" all="All brands" value={filters.brand} options={brands.map((value) => [value, value])}/>
          <FilterSelect name="size" label="Size per item" all="All sizes" value={filters.size} options={sizes.map((value) => [value, value])}/>
          <FilterSelect name="unit" label="Selling unit" all="All selling units" value={filters.unit} options={unitOptions}/>
          <FilterSelect name="availability" label="Availability" all="Any availability" value={filters.availability} options={availabilityOptions}/>
          <FilterSelect name="purchase" label="How to buy" all="All products" value={filters.purchase} options={purchaseOptions}/>
          <div className="form-grid">
            <label>Min price (₦)<input name="min" type="number" min={0} max={10000000} inputMode="numeric" defaultValue={filters.min}/></label>
            <label>Max price (₦)<input name="max" type="number" min={0} max={10000000} inputMode="numeric" defaultValue={filters.max}/></label>
          </div>
        </div>
        {formError && <p className="form-error mt-2" role="alert">{formError}</p>}
        <button className="button button-green mt-3" type="submit">Apply filters</button>
      </form>
    </details>
    {(applied.length > 0 || filters.sort) && <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
      {applied.map(([key, label]) => <Link className="active-filter" aria-label={`Remove filter ${label}`} key={key} href={shopHref({ ...filters, [key]: "" })} onNavigate={() => recordShopEvent("filter_apply")}>
        {label}<X size={15} aria-hidden="true"/>
      </Link>)}
      <Link className="text-link ml-1" href="/shop" onNavigate={() => recordShopEvent("filter_apply")}>Reset filters</Link>
    </div>}
    {matches.length > 0 ? <ProductGrid products={matches}/> : <div className="empty-state catalog-empty">
      <Search size={32}/><h2>No products found</h2><p>Try a brand or product name, or clear your filters to see more products.</p>
      <Link className="button button-green" href="/shop">View all products <ArrowRight size={17}/></Link>
    </div>}
  </>;
}
