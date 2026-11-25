"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { deliveryZones } from "@/lib/commerce";
import type { DeliveryConfiguration } from "@/lib/store-settings";

type DeliveryRecord = { configuration: DeliveryConfiguration; version: string | null };

async function configuredDelivery(user: User, settings?: DeliveryRecord, signal?: AbortSignal): Promise<DeliveryRecord> {
  const token = await user.getIdToken();
  const response = await fetch("/api/admin/delivery", {
    method: settings ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(settings && { "Content-Type": "application/json" }),
    },
    body: settings ? JSON.stringify(settings) : undefined,
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.fields?.[0]?.message ?? result.error ?? "Delivery settings couldn’t be loaded.");
  return result;
}

export function DeliveryOperations({ user }: { user: User }) {
  const [data, setData] = useState<DeliveryRecord | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    configuredDelivery(user, undefined, request.signal)
      .then((result) => { if (!request.signal.aborted) setData(result); })
      .catch((problem: unknown) => {
        if (!request.signal.aborted) setError(problem instanceof Error ? problem.message : "Delivery settings couldn’t be loaded.");
      });
    return () => request.abort();
  }, [user, revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || working) return;
    const form = new FormData(event.currentTarget);
    const value = (field: string) => String(form.get(field) ?? "").trim();
    const rule = (area: "island" | "mainland" | "outer") => ({ fee: Number(value(`${area}-fee`)), time: value(`${area}-estimate`) });
    const minimum = value("minimumSubtotal");
    const weight = value("quoteAboveWeightGrams");
    const configuration = {
      freeFrom: Number(value("freeFrom")), island: rule("island"), mainland: rule("mainland"), outer: rule("outer"),
      ...(minimum && { minimumSubtotal: Number(minimum) }),
      ...(weight && { quoteAboveWeightGrams: Number(weight) }),
    };
    setWorking(true); setError(""); setNotice("");
    try {
      setData(await configuredDelivery(user, { configuration, version: data.version }));
      setNotice("Delivery settings saved.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Delivery settings couldn’t be saved.");
    } finally {
      setWorking(false);
    }
  }

  const settings = data?.configuration;
  return <section className="admin-section">
    <div className="admin-section-head">
      <h2>Delivery configuration</h2>
      <button type="button" className="button button-outline" disabled={working} onClick={() => {
        setError(""); setNotice(""); setData(null); setRevision((current) => current + 1);
      }}>Reload settings</button>
    </div>
    {error && <p className="form-error mb-3" role="alert">{error}</p>}
    {notice && <p className="inline-notice mb-3" role="status">{notice}</p>}
    {!settings && !error && <p role="status">Loading delivery settings…</p>}
    {settings && <form key={data.version ?? "defaults"} className="form-card" onSubmit={submit}>
      <p className="muted mb-4">Only enter confirmed charges and estimates. Delivery outside the listed Lagos areas requires a quotation.</p>
      <fieldset className="form-grid" disabled={working}>
        <legend className="sr-only">Lagos delivery prices and limits</legend>
        {deliveryZones.map(({ id, name }) => <fieldset key={id} className="form-grid field-wide">
          <legend className="mb-2 font-bold">{name}</legend>
          <label>Delivery fee (₦)<input name={`${id}-fee`} type="number" min={0} step={1} max={200000} defaultValue={settings[id].fee} required/></label>
          <label>Estimated delivery<input name={`${id}-estimate`} minLength={3} maxLength={90} defaultValue={settings[id].time} required/></label>
        </fieldset>)}
        <label>Free delivery from (₦)<input name="freeFrom" type="number" min={1} step={1} max={10000000} defaultValue={settings.freeFrom} required/></label>
        <label>Minimum subtotal for Lagos delivery (optional)<input name="minimumSubtotal" type="number" min={1} step={1} max={10000000} defaultValue={settings.minimumSubtotal} placeholder="No minimum configured"/></label>
        <label className="field-wide">Require quote above basket weight (grams, optional)<input name="quoteAboveWeightGrams" type="number" min={1} step={1} max={100000000} defaultValue={settings.quoteAboveWeightGrams} placeholder="No weight threshold configured"/></label>
        <p className="muted field-wide text-sm">If a weight threshold is set, baskets containing items without verified shipping weights also require a quote. Set product-level delivery exceptions in the product editor.</p>
      </fieldset>
      <button type="submit" className="button button-green mt-4" disabled={working}>{working ? "Saving…" : "Save delivery settings"}</button>
    </form>}
  </section>;
}
