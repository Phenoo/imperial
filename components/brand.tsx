import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link className={`brand${inverse ? " brand-inverse" : ""}`} href="/" aria-label="Imperial Foods and Beverages home">
    <span><strong>imperial<span className="brand-dot">.</span></strong><small>FOODS &amp; BEVERAGES</small></span>
  </Link>;
}
