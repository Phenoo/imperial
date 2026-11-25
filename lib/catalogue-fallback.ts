import { starterCatalog } from "./catalog.ts";
import { publicProduct, type Product } from "./commerce.ts";

export function catalogueFallback(): Product[] {
  return starterCatalog.filter((product) => product.active).map((product) => publicProduct({
    ...product,
    price: null, comparePrice: null, quotePrice: undefined,
    checkoutApproved: undefined, stockVerified: undefined, pricePublished: undefined,
    stock: 0, purchaseMode: "quote",
  }));
}
