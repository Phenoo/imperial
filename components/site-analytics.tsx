"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { shopEvents } from "@/lib/shop-analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean;
  }
}

const storageKey = "imperial-analytics-consent-v1";
const changeEvent = "imperial:analytics-consent";
let temporaryChoice: string | null = null;
function snapshot() {
  try { return temporaryChoice ?? localStorage.getItem(storageKey) ?? "pending"; }
  catch { return temporaryChoice ?? "pending"; }
}
function subscribe(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}
const serverSnapshot = () => "pending";
const publicPage = (path: string) => !/^\/(?:admin|api|catalogue-update|checkout|track|saved)(?:\/|$)/.test(path);
const googleBootstrap = `
window.dataLayer=window.dataLayer||[];
window.gtag=function(){window.dataLayer.push(arguments);};
window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
window.gtag('set',{page_location:window.location.origin+window.location.pathname,page_referrer:'',allow_google_signals:false,allow_ad_personalization_signals:false,send_page_view:false});
`;

function Analytics({ id, mode }: { id: string; mode: "sandbox" | "live" }) {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [editing, setEditing] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [ready, setReady] = useState(false);
  const allowed = consent === "granted";

  function choose(value: "granted" | "denied") {
    temporaryChoice = value;
    try { localStorage.setItem(storageKey, value); temporaryChoice = null; } catch { /* Keep this visit's choice when storage is unavailable. */ }
    if (value === "denied") {
      window[`ga-disable-${id}`] = true;
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (!/^_ga(?:_|$)/.test(name)) continue;
        for (const domain of ["", location.hostname, `.${location.hostname}`, `.${location.hostname.split(".").slice(-2).join(".")}`]) {
          document.cookie = `${name}=; Max-Age=0; path=/;${domain ? ` domain=${domain};` : ""} SameSite=Lax; Secure`;
        }
      }
    }
    window.dispatchEvent(new Event(changeEvent));
    setEditing(false);
  }

  useEffect(() => {
    window[`ga-disable-${id}`] = !allowed || !publicPage(pathname);
    window.gtag?.("consent", "update", { analytics_storage: allowed ? "granted" : "denied" });
    if (!allowed || !ready || !publicPage(pathname)) return;
    // Never pass query strings, order references or invitation tokens to Google.
    const properties = { page_location: location.origin + pathname, page_referrer: "", commerce_mode: mode };
    window.gtag?.("event", "page_view", { ...properties, page_title: document.title });
    function record(event: Event) {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== "object" || !("event" in detail) || !shopEvents.some(name => name === detail.event)) return;
      window.gtag?.("event", String(detail.event), properties);
    }
    window.addEventListener("imperial:shop-event", record);
    return () => window.removeEventListener("imperial:shop-event", record);
  }, [allowed, ready, id, pathname, mode]);

  return <>
    {allowed && publicPage(pathname) && <>
      <Script id="imperial-ga-bootstrap" strategy="afterInteractive" onReady={() => setBootstrapReady(true)}>
        {googleBootstrap}
      </Script>
      {bootstrapReady && <Script id="imperial-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" onReady={() => {
        if (snapshot() !== "granted" || !publicPage(location.pathname) || !window.gtag) return;
        window[`ga-disable-${id}`] = false;
        window.gtag("js", new Date());
        window.gtag("config", id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location.origin + pathname, page_referrer: "" });
        setReady(true);
      }}/>} 
    </>}
    {publicPage(pathname) && <>
      <div className="analytics-preferences"><button type="button" onClick={() => setEditing(true)}>Analytics preferences</button></div>
      {(consent === "pending" || editing) && <section className="analytics-choice" aria-label="Analytics preferences">
        <strong>Your privacy choices</strong>
        <p>Allow Google Analytics to help us understand visits and shopping activity? It is optional. Your choice will not affect shopping. <Link href="/privacy">Privacy policy</Link></p>
        <div><button type="button" className="button button-outline" onClick={() => choose("denied")}>No thanks</button><button type="button" className="button button-green" onClick={() => choose("granted")}>Allow analytics</button></div>
      </section>}
    </>}
  </>;
}

export function SiteAnalytics({ id, mode }: { id?: string; mode: "sandbox" | "live" }) {
  return id && /^G-[A-Z0-9]+$/.test(id) ? <Analytics id={id} mode={mode}/> : null;
}
