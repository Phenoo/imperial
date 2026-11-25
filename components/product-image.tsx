import Image from "next/image";
import { hasExactPack, packLabel, type Product } from "@/lib/commerce";

export function ProductImage({ product, sizes, priority = false }: { product: Pick<Product, "name" | "image" | "size" | "saleUnit" | "itemsPerUnit" | "unitsPerCarton" | "containedUnit" | "totalSize" | "bundleContents">; sizes: string; priority?: boolean }) {
  return <div className="product-image"><Image src={product.image} fill sizes={sizes} alt={hasExactPack(product) ? `${product.name}, ${packLabel(product)}` : `${product.name} packaging`} unoptimized={!product.image.startsWith("/images/")} preload={priority} referrerPolicy="no-referrer" /></div>;
}
