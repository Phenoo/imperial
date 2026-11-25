import { categories, categoryName, listedPrice, packLabel, productAvailability, type Product } from "./commerce";

const filterKeys = ["q", "category", "brand", "size", "unit", "min", "max", "availability", "purchase", "sort"] as const;
type FilterKey = typeof filterKeys[number];
export type ShopFilters = Record<FilterKey, string>;

export const sortOptions = [
  ["", "Recommended"], ["low", "Price: low to high"], ["high", "Price: high to low"], ["name", "Name: A to Z"],
] as const;

export function readShopFilters(read: (key: FilterKey) => unknown): ShopFilters {
  function input(key: FilterKey, limit = 100) {
    const value = read(key);
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
  }
  function choice(key: FilterKey, options: readonly string[]) {
    const value = input(key);
    return options.includes(value) ? value : "";
  }
  function price(key: "min" | "max") {
    const value = input(key, 8);
    return /^\d{1,8}$/.test(value) && Number(value) <= 10000000 ? value : "";
  }
  return {
    q: input("q"), category: choice("category", categories.map(({ id }) => id)),
    brand: input("brand", 45), size: input("size", 100),
    unit: choice("unit", ["single", "pack", "bulk"]), min: price("min"), max: price("max"),
    availability: choice("availability", ["in-stock", "out-of-stock", "quote"]),
    purchase: choice("purchase", ["checkout", "quote", "wholesale", "retail"]),
    sort: choice("sort", sortOptions.map(([value]) => value)),
  };
}

export function shopHref(filters: Partial<ShopFilters> = {}) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params.size ? `/shop?${params}` : "/shop";
}

export function searchText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f'’]/g, "").replace(/(\d)\s+(?=[a-z])/g, "$1");
}

export function productMatches(product: Product, tokens: readonly string[]) {
  const haystack = searchText([
    product.name, product.brand, categoryName(product.category), product.size, packLabel(product),
    product.description, product.origin, product.sku,
  ].filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

export function filterProducts(products: readonly Product[], filters: ShopFilters) {
  const tokens = searchText(filters.q).split(/\s+/).filter(Boolean);
  const matches = products.filter((product) => {
    if (filters.category && product.category !== filters.category) return false;
    if (filters.brand && product.brand !== filters.brand) return false;
    if (filters.size && product.size !== filters.size) return false;
    const bulk = product.saleUnit === "carton" || product.saleUnit === "case";
    if (filters.unit === "bulk" && !bulk) return false;
    if (filters.unit === "pack" && product.saleUnit !== "pack") return false;
    if (filters.unit === "single" && (!product.saleUnit || bulk || product.saleUnit === "pack")) return false;
    const status = productAvailability(product);
    if (filters.availability && status !== filters.availability) return false;
    if (filters.purchase === "checkout" && status !== "in-stock") return false;
    if (filters.purchase === "quote" && status !== "quote") return false;
    if (filters.purchase === "wholesale" && !bulk && !["both", "wholesale", "quote"].includes(product.purchaseMode ?? "")) return false;
    if (filters.purchase === "retail" && (!["both", "retail"].includes(product.purchaseMode ?? "") || bulk || status === "quote")) return false;
    const price = listedPrice(product);
    if (filters.min && (price === null || price < Number(filters.min))) return false;
    if (filters.max && (price === null || price > Number(filters.max))) return false;
    return productMatches(product, tokens);
  });
  if (filters.sort === "name") return matches.sort((a, b) => a.name.localeCompare(b.name, "en-NG"));
  if (filters.sort === "low" || filters.sort === "high") {
    return matches.sort((a, b) => {
      const aPrice = listedPrice(a);
      const bPrice = listedPrice(b);
      if (aPrice === null) return bPrice === null ? 0 : 1;
      if (bPrice === null) return -1;
      return filters.sort === "low" ? aPrice - bPrice : bPrice - aPrice;
    });
  }
  return matches;
}
