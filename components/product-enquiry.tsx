"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { recordShopEvent } from "@/lib/shop-analytics";

export function ProductViewEvent({ productId }: { productId: string }) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current === productId) return;
    previous.current = productId;
    recordShopEvent("product_view");
  }, [productId]);
  return null;
}

export function ProductEnquiry({ whatsapp, productId, name, specification, canonicalUrl }: {
  whatsapp: string;
  productId: string;
  name: string;
  specification: string;
  canonicalUrl: string | null;
}) {
  const path = `/products/${productId}`;
  function link(url: string) {
    const text = `Hello Imperial, I have a question about ${name}.\nSelling unit: ${specification}\n${url}`;
    return `${whatsapp}?text=${encodeURIComponent(text)}`;
  }
  return <a
    className="button button-outline"
    href={link(canonicalUrl ?? path)}
    onClick={(event) => {
      if (!canonicalUrl) event.currentTarget.href = link(new URL(path, window.location.origin).href);
      recordShopEvent("product_enquiry_click");
    }}
    target="_blank"
    rel="noopener noreferrer"
  ><MessageCircle size={18} aria-hidden="true"/> Enquire on WhatsApp</a>;
}
