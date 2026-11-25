import { starterCatalog } from "./catalog.ts";
import type { CategoryId, Product } from "./commerce.ts";

export function demoCatalog() {
  return starterCatalog;
}

const priceRanges: Record<CategoryId, readonly [number, number]> = {
  rice: [15000, 75000], tins: [2000, 12000], noodles: [2500, 16000],
  drinks: [2500, 22000], snacks: [1500, 8000], hampers: [60000, 200000],
  cooking: [3500, 35000], breakfast: [3500, 28000],
};

export function ownerPreviewCatalog(): Product[] {
  return starterCatalog.filter((product) => product.active).map((product) => {
    const hash = [...product.id].reduce((value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0, 17);
    const [minimum, maximum] = priceRanges[product.category];
    const price = minimum + (hash % (Math.floor((maximum - minimum) / 100) + 1)) * 100;
    return {
      ...product, price, comparePrice: null, quotePrice: undefined, demo: true,
      checkoutApproved: undefined, stockVerified: undefined, pricePublished: undefined, stock: 0,
    };
  });
}
