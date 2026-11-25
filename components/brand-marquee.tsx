import Image from "next/image";
import Link from "next/link";
import styles from "./brand-marquee.module.css";

type BrandLogo = { name: string; image: string };

export function BrandMarquee({ brands }: { brands: readonly BrandLogo[] }) {
  return <section className={styles.marquee} aria-label="Brands we stock">
    <ul className={styles.track}>
      {brands.map(({ name, image }) => <li key={name}>
        <Link href={`/shop?q=${encodeURIComponent(name)}`} className={styles.brand} aria-label={`Shop ${name} products`}>
          <span className={styles.logo}><Image src={image} alt="" fill unoptimized/></span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
