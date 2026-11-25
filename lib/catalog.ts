import type { Product } from "./commerce.ts";
import { hamperOffers } from "./hamper-offers.ts";
import { supplierProducts } from "./supplier-catalog.ts";

const photoProducts = [
  {
    id: "dinor-mackerel", name: "Dinor Mackerel in Tomato Sauce", brand: "Dinor", size: "155 g",
    description: "Dinor mackerel comes in tomato sauce that you can use as the base for a quick fish stew. Warm the fish and sauce with sliced onions and fresh pepper, then serve with white rice.",
  },
  {
    id: "estus-mackerel", name: "Estus Mackerel in Tomato Sauce", brand: "Estus", size: "155 g",
    description: "Estus mackerel is packed in tomato sauce for an easy meal from the cupboard. Warm it through with onions and a little pepper and spoon it over boiled yam or fried plantain.",
  },
  {
    id: "estus-sardines", name: "Estus Sardines in Vegetable Oil", brand: "Estus", size: "125 g",
    description: "Estus sardines in vegetable oil are easy to flake into a filling for soft bread. Add sliced onion and a squeeze of lime, or serve them with rice and a spoonful of tomato stew.",
  },
  {
    id: "todays-sardines", name: "Today’s Sardines in Vegetable Oil", brand: "Today’s", size: "",
    description: "Today’s sardines in vegetable oil make a simple topping for toast or a filling for an omelette. Stir the fish into a cooked tomato and pepper sauce just before serving to keep the pieces intact.",
  },
  {
    id: "immaculate-sardines", name: "Immaculate Sardines in Vegetable Oil", brand: "Immaculate", size: "125 g",
    description: "Immaculate sardines are packed in vegetable oil and can be served straight from the tin. Flake them into a salad with cucumber and tomatoes, or serve with boiled yam and pepper sauce.",
  },
  {
    id: "casa-sardines", name: "Casa Sardines in Vegetable Oil", brand: "Casa", size: "125 g",
    description: "Casa sardines in vegetable oil make a quick sandwich filling. Mash them lightly with chopped onions and a little mayonnaise, or serve the fish whole with bread and sliced tomatoes.",
  },
  {
    id: "blue-pearl-sardines", name: "Blue Pearl Sardines in Vegetable Oil", brand: "Blue Pearl", size: "125 g",
    description: "Blue Pearl sardines in vegetable oil are handy for a quick lunch. Serve them with rice, thinly sliced onions and lime, or flake them over fried plantain with a little fresh pepper.",
  },
  {
    id: "sarah-sardines", name: "Sarah Sardines in Vegetable Oil", brand: "Sarah", size: "125 g",
    description: "Sarah sardines are packed in vegetable oil and can be broken into pieces for a sandwich or pepper sauce. Fold them into scrambled eggs for a filling breakfast with bread.",
  },
  {
    id: "demanna-sardines", name: "De’Manna Sardines in Vegetable Oil", brand: "De’Manna", size: "125 g",
    description: "De’Manna sardines in vegetable oil are useful for meals that need little preparation. Flake them over a plate of rice and beans or serve them on toasted bread with chopped pepper.",
  },
  {
    id: "de-gold-sardines", name: "De Gold Sardines", brand: "De Gold", size: "125 g",
    description: "De Gold tinned sardines make an easy filling for bread with sliced cucumber. For a hot meal, add them at the end to a pepper sauce and serve with boiled yam.",
  },
  {
    id: "exeter-corned-beef", name: "Exeter Corned Beef", brand: "Exeter", size: "340 g",
    description: "Exeter corned beef can be sliced for sandwiches or crumbled into eggs and tomato stew. Fry it briefly with onions and peppers for a filling to serve with bread or boiled potatoes.",
  },
  {
    id: "lido-pilchards", name: "Lido Pilchards", brand: "Lido", size: "",
    description: "Lido pilchards are tinned fish for quick lunches and dinners. Gently break the fish into a cooked onion and pepper sauce, or serve it with boiled yam or toast.",
  },
] satisfies Pick<Product, "id" | "name" | "brand" | "size" | "description">[];

export const starterCatalog: Product[] = [
  {
    id: "tilda-pure-basmati", name: "Tilda Pure Basmati Rice", brand: "Tilda", category: "rice", origin: "Himalayan foothills", size: "5 kg",
    saleUnit: "bag", demo: true,
    price: 34500, comparePrice: 38000, stock: 28, active: true, featured: true, rank: 10, image: "/images/tilda.webp",
    description: "Tilda Pure Basmati is a fragrant long-grain rice with a light, fluffy texture when cooked. Use it for jollof, fried rice or biryani, or serve it plain with tomato stew.",
  },
  {
    id: "titus-sardines", name: "Titus Sardines in Oil", brand: "Titus", category: "tins", origin: "Morocco", size: "125 g",
    saleUnit: "tin", demo: true,
    price: 2150, comparePrice: null, stock: 48, active: true, featured: true, rank: 20, image: "/images/titus.webp",
    description: "Titus sardines are packed in oil and ready to serve. Flake them over toast, fold them into a pepper sauce or add them to a plate of rice with sliced onions and a squeeze of lime.",
  },
  {
    id: "indomie-mi-goreng", name: "Indomie Mi Goreng Original", brand: "Indomie", category: "noodles", origin: "Indonesia", size: "85 g",
    saleUnit: "each", demo: true,
    price: 1850, comparePrice: null, stock: 72, active: true, featured: true, rank: 30, image: "/images/indomie.webp",
    description: "Indomie Mi Goreng are Indonesian instant noodles with sweet soy and savoury seasoning. Boil and drain the noodles, then toss them with the seasoning and serve with a fried egg or vegetables.",
  },
  {
    id: "tilda-grand-basmati", name: "Tilda Grand Extra Long Basmati", brand: "Tilda", category: "rice", origin: "Himalayan foothills", size: "5 kg",
    saleUnit: "bag", demo: true,
    price: 38500, comparePrice: null, stock: 20, active: true, featured: true, rank: 40, image: "/images/grand.webp",
    description: "Tilda Grand is an extra-long basmati with a gentle aroma and a light texture. The grains are suited to layered biryani, pilau or fried rice for a family gathering.",
  },
  {
    id: "welchs-concord-grape", name: "Welch’s Concord Grape Juice", brand: "Welch’s", category: "drinks", origin: "United States", size: "1.36 L",
    saleUnit: "bottle", demo: true,
    price: 9200, comparePrice: null, stock: 24, active: true, featured: true, rank: 50, image: "/images/welchs.webp",
    description: "Welch’s Concord grape juice has a deep purple colour and a full grape flavour. Serve it chilled with a meal, or add sparkling water and ice for a lighter drink.",
  },
  {
    id: "barilla-spaghetti", name: "Barilla Classic Spaghetti", brand: "Barilla", category: "noodles", origin: "Italy", size: "500 g",
    saleUnit: "each", demo: true,
    price: 4800, comparePrice: null, stock: 30, active: true, featured: true, rank: 60, image: "/images/barilla.webp",
    description: "Barilla’s classic spaghetti is made with durum wheat. Cook it until just tender and toss with a tomato sauce, or make jollof spaghetti with a well-seasoned pepper base.",
  },
  {
    id: "geisha-mackerel", name: "Geisha Mackerel in Tomato Sauce", brand: "Geisha", category: "tins", origin: "Imported", size: "155 g",
    saleUnit: "tin", demo: true,
    price: 2850, comparePrice: null, stock: 31, active: true, featured: true, rank: 70, image: "/images/geisha.webp",
    description: "Geisha mackerel comes in a tomato sauce that goes well with white rice or boiled yam. Heat it gently with onions and pepper, taking care to keep the fish in whole pieces.",
  },
  {
    id: "mcvities-digestives", name: "McVitie’s Original Digestives", brand: "McVitie’s", category: "snacks", origin: "United Kingdom", size: "360 g",
    saleUnit: "each", demo: true,
    price: 5900, comparePrice: null, stock: 18, active: true, featured: true, rank: 80, image: "/images/mcvities.webp",
    description: "McVitie’s Original Digestives are crumbly wheat biscuits with a touch of sweetness. Serve them with tea or coffee, or crush a few with melted butter for a cheesecake base.",
  },
  ...photoProducts.map((product, index): Product => ({
    ...product,
    category: "tins",
    origin: "",
    price: null,
    comparePrice: null,
    stock: 0,
    active: true,
    featured: false,
    rank: 90 + index * 10,
    image: `/images/${product.id}.webp`,
  })),
  ...hamperOffers.map((offer, index): Product => ({
    id: offer.id,
    name: offer.name,
    brand: "Imperial Foods & Beverages",
    category: "hampers",
    origin: "",
    size: "1 bundle",
    saleUnit: "bundle",
    bundleContents: [...offer.contents],
    demo: true,
    price: offer.price,
    comparePrice: null,
    stock: offer.stock,
    image: `/images/${offer.id}.webp`,
    description: offer.summary,
    active: true,
    featured: false,
    rank: 210 + index * 10,
  })),
  ...supplierProducts.map((product, index): Product => ({
    ...product,
    ...(/^royal-palace-basmati-(1|5)kg$/.test(product.id) && { variantGroup: "royal-palace-basmati", saleUnit: "bag" }),
    origin: "",
    price: null,
    comparePrice: null,
    stock: 0,
    image: `/images/catalog-${product.id}.webp`,
    active: true,
    featured: false,
    rank: 300 + index * 10,
  })),
];

const starterById = new Map(starterCatalog.map((product) => [product.id, product]));

export function knownProductDetails(product: Product): Product {
  if (product.checkoutApproved) return product;
  const starter = starterById.get(product.id);
  if (!starter) return product;
  return {
    ...product,
    ...(starter.saleUnit && !product.saleUnit && { saleUnit: starter.saleUnit }),
    ...(starter.bundleContents && !product.bundleContents && { bundleContents: starter.bundleContents }),
    ...(starter.variantGroup && !product.variantGroup && { variantGroup: starter.variantGroup }),
  };
}
