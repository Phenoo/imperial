"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { naira } from "@/lib/commerce";
import type { HamperOffer } from "@/lib/hamper-offers";

export type HamperSlide = Pick<HamperOffer, "id" | "name" | "tab" | "label" | "lead" | "accent" | "theme" | "summary"> & {
  price: number;
  image: string;
};

const INTERVAL = 8000;
const motionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const prefersReducedMotion = () => window.matchMedia(motionQuery).matches;
const serverPrefersReducedMotion = () => true;

export function HamperHero({ offers }: { offers: [HamperSlide, ...HamperSlide[]] }) {
  const [index, setIndex] = useState(0);
  const [rotation, setRotation] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useSyncExternalStore(subscribeToMotion, prefersReducedMotion, serverPrefersReducedMotion);
  const rotationEnabled = rotation ?? !reducedMotion;
  const count = offers.length;
  const activeIndex = index % count;
  const offer = offers[activeIndex];

  useEffect(() => {
    if (count < 2 || !rotationEnabled || hovered || focused) return;
    const timer = window.setInterval(() => setIndex((previous) => (previous + 1) % count), INTERVAL);
    return () => window.clearInterval(timer);
  }, [count, rotationEnabled, hovered, focused]);

  function select(nextIndex: number) {
    const next = (nextIndex + count) % count;
    setRotation(false);
    setIndex(next);
    setAnnouncement(`${offers[next].name}, offer ${next + 1} of ${count}`);
  }

  return <section
    className="hamper-hero"
    aria-label="Seasonal hamper offers"
    aria-roledescription="carousel"
    onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
  >
    <h1 className="sr-only">Imperial seasonal hamper offers</h1>
    <div className={`hamper-slide hamper-${offer.theme}`} role="group" aria-roledescription="slide" aria-label={`${activeIndex + 1} of ${count}`}>
      <div className="hamper-copy" key={offer.id}>
        <span className="hamper-label">{offer.label}</span>
        <h2>{offer.lead} <em>{offer.accent}</em></h2>
        <p>{offer.summary}</p>
        <div className="hamper-price"><strong>{naira(offer.price)}</strong><span>per bundle</span></div>
        <div className="hamper-actions">
          <Link className="button hamper-primary" href={`/products/${offer.id}`}>Shop this bundle <ArrowRight size={19}/></Link>
          <Link className="hamper-more" href="/shop?category=hampers">All hampers <ChevronRight size={17}/></Link>
        </div>
      </div>
      <div className="hamper-art" key={offer.image}>
        <Image
          src={offer.image}
          alt={`Illustration of the ${offer.name} with product packshots`}
          fill
          preload={activeIndex === 0}
          loading={activeIndex === 0 ? undefined : "eager"}
          sizes="(max-width: 760px) 100vw, 53vw"
          unoptimized
        />
      </div>
    </div>
    {count > 1 && <div className="hamper-controls">
      <div className="hamper-navigation" role="group" aria-label="Slideshow controls">
        <button className="hamper-control" type="button" aria-label={rotationEnabled ? "Pause slideshow" : "Play slideshow"} onClick={() => setRotation(!rotationEnabled)}>
          {rotationEnabled ? <Pause size={16}/> : <Play size={16}/>}
        </button>
        <button className="hamper-control" type="button" aria-label="Previous offer" onClick={() => select(activeIndex - 1)}><ChevronLeft size={21}/></button>
        <button className="hamper-control" type="button" aria-label="Next offer" onClick={() => select(activeIndex + 1)}><ChevronRight size={21}/></button>
      </div>
      <div className="hamper-selectors" role="group" aria-label="Choose a hamper offer">
        {offers.map((entry, i) => <button type="button" className="hamper-selector" key={entry.id} aria-label={`Show ${entry.name}`} aria-pressed={i === activeIndex} onClick={() => select(i)}>
          <span>{entry.tab}</span>
        </button>)}
      </div>
    </div>}
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}
