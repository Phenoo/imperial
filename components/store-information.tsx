import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const pages = [
  { href: "/about", title: "About Imperial" },
  { href: "/contact", title: "Contact" },
  { href: "/delivery", title: "Delivery & collection" },
  { href: "/returns", title: "Returns & refunds" },
  { href: "/faq", title: "Frequently asked questions" },
  { href: "/terms", title: "Terms & Conditions" },
  { href: "/privacy", title: "Privacy Policy" },
] as const;

export function StoreInformation({ current, description, children }: {
  current: typeof pages[number]["href"];
  description: string;
  children: ReactNode;
}) {
  const title = pages.find((page) => page.href === current)?.title;
  return <div className="shell subpage">
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link><ChevronRight size={14}/><span>{title}</span>
    </nav>
    <div className="page-intro"><h1>{title}</h1><p>{description}</p></div>
    <div className="info-layout">
      <article className="form-card info-body min-[761px]:col-start-2 min-[761px]:row-start-1">{children}</article>
      <nav className="form-card info-nav min-[761px]:col-start-1 min-[761px]:row-start-1" aria-label="Store information">
        {pages.map((page) => <Link href={page.href} key={page.href} aria-current={page.href === current ? "page" : undefined}>
          {page.title}<ChevronRight size={15}/>
        </Link>)}
      </nav>
    </div>
  </div>;
}

