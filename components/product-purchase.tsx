"use client";

import { useState } from "react";
import { productLimit, sellingUnitLabel, type Product } from "@/lib/commerce";
import { AddButton, SaveButton } from "./product-card";
import { Quantity } from "./shop-chrome";
import { useShop } from "./shop-context";

export function ProductPurchase({ product }: { product: Product }) {
  const shop = useShop();
  const inBasket = shop.items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const minimum = Math.max(1, (product.minimumQuantity ?? 1) - inBasket);
  const [requested, setRequested] = useState(minimum);
  const max = Math.max(0, productLimit(product) - inBasket);
  const quantity = Math.max(minimum, Math.min(requested, max));
  const unit = sellingUnitLabel(product.saleUnit, quantity);
  return <div>
    {product.price !== null && max >= minimum && <p className="muted mb-2 text-sm">
      {quantity} {unit} selected{(product.minimumQuantity ?? 1) > 1 ? ` · minimum ${product.minimumQuantity} ${sellingUnitLabel(product.saleUnit, product.minimumQuantity)}` : ""}
    </p>}
    <div className="product-purchase">
      {max > minimum && <Quantity quantity={quantity} min={minimum} max={max} label={`${product.name} ${unit}`} onChange={(value) => setRequested(Math.max(minimum, value))}/>}
      <AddButton product={product} quantity={quantity}/>
      <SaveButton product={product}/>
    </div>
  </div>;
}
