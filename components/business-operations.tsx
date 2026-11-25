"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import type { BusinessDashboard, BusinessFields, ReviewRecord, SupportCase } from "@/lib/business";

type ApiError = { error?: string; fields?: { message: string }[] };
type Mode = "details" | "reviews" | "support";

async function request<T>(user: User, options: RequestInit = {}) {
  const token = await user.getIdToken();
  const response = await fetch("/api/admin/business", {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data: T & ApiError = await response.json();
  if (!response.ok) throw new Error(data.fields?.[0]?.message ?? data.error ?? "Couldn’t complete the request.");
  return data;
}

const detailFields: ReadonlyArray<{
  name: keyof BusinessFields;
  label: string;
  limit: number;
  type?: "email" | "tel" | "url";
  multiline?: boolean;
}> = [
  { name: "tradingName", label: "Trading name", limit: 120 },
  { name: "registration", label: "Verified registration details", limit: 160 },
  { name: "address", label: "Approved public address", limit: 250, multiline: true },
  { name: "phone", label: "Public telephone", limit: 26, type: "tel" },
  { name: "whatsappNumber", label: "WhatsApp number with country code", limit: 14, type: "tel" },
  { name: "supportEmail", label: "Verified support email", limit: 150, type: "email" },
  { name: "privacyEmail", label: "Verified privacy email", limit: 150, type: "email" },
  { name: "serviceHours", label: "Customer service hours", limit: 200 },
  { name: "instagram", label: "Instagram link", limit: 1000, type: "url" },
  { name: "facebook", label: "Facebook link", limit: 1000, type: "url" },
  { name: "photoUrl", label: "Approved business photo URL", limit: 1000, type: "url" },
  { name: "photoAlt", label: "Business photo description", limit: 160 },
  { name: "mapUrl", label: "Map link for your public address", limit: 1000, type: "url" },
  { name: "collectionHours", label: "Approved collection hours", limit: 200 },
  { name: "collectionInstructions", label: "Approved collection instructions", limit: 500, multiline: true },
  { name: "wholesaleResponse", label: "Approved wholesale response expectation", limit: 250, multiline: true },
  { name: "refundProcessing", label: "Approved refund processing expectation", limit: 250, multiline: true },
];

const sections: { id: Mode; label: string }[] = [
  { id: "details", label: "Business details" },
  { id: "reviews", label: "Customer feedback" },
  { id: "support", label: "Support cases" },
];

export function BusinessOperations({ user }: { user: User }) {
  const [dashboard, setDashboard] = useState<BusinessDashboard | null>(null);
  const [mode, setMode] = useState<Mode>("details");
  const [reviewId, setReviewId] = useState("");
  const [supportId, setSupportId] = useState("");
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const reviewDraft = useRef<string | null>(null);
  const supportDraft = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request<BusinessDashboard>(user, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setDashboard(data);
    }).catch((problem: unknown) => {
      if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Couldn’t load store information.");
    });
    return () => controller.abort();
  }, [user, loadingAttempt]);

  function resetMessages() {
    setError("");
    setNotice("");
  }

  function reload() {
    resetMessages();
    setDashboard(null);
    setLoadingAttempt((previous) => previous + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard || busy.current) return;
    const fields = new FormData(event.currentTarget);
    busy.current = true;
    setSaving(true);
    resetMessages();
    try {
      if (mode === "details") {
        const update = await request<Pick<BusinessDashboard, "business" | "version">>(user, {
          method: "PUT",
          body: JSON.stringify({ kind: "business", value: Object.fromEntries(fields), version: dashboard.version }),
        });
        setDashboard({ ...dashboard, business: update.business, version: update.version });
        setNotice("Business details saved.");
      } else if (mode === "reviews") {
        if (!reviewId && !reviewDraft.current) reviewDraft.current = crypto.randomUUID();
        const update = await request<{ review: ReviewRecord }>(user, {
          method: "PUT",
          body: JSON.stringify({
            kind: "review",
            value: {
              ...Object.fromEntries(fields),
              id: reviewId || reviewDraft.current,
              rating: fields.get("rating") ? Number(fields.get("rating")) : null,
              publishPermission: fields.has("publishPermission"),
              identityPermission: fields.has("identityPermission"),
            },
          }),
        });
        setDashboard({ ...dashboard, reviews: [update.review, ...dashboard.reviews.filter((review) => review.id !== update.review.id)] });
        setReviewId(update.review.id);
        reviewDraft.current = null;
        setNotice("Customer feedback saved.");
      } else {
        if (!supportId && !supportDraft.current) supportDraft.current = crypto.randomUUID();
        const update = await request<{ supportCase: SupportCase }>(user, {
          method: "PUT",
          body: JSON.stringify({ kind: "support", value: { ...Object.fromEntries(fields), id: supportId || supportDraft.current } }),
        });
        setDashboard({ ...dashboard, supportCases: [update.supportCase, ...dashboard.supportCases.filter((supportCase) => supportCase.id !== update.supportCase.id)] });
        setSupportId(update.supportCase.id);
        supportDraft.current = null;
        setNotice("Support case saved.");
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn’t save the changes. Try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!dashboard) return <section className="form-card">
    {error ? <><p className="form-error" role="alert">{error}</p><button className="button button-outline" type="button" onClick={reload}>Retry</button></> : <p role="status">Loading store information…</p>}
  </section>;

  const review = dashboard.reviews.find((entry) => entry.id === reviewId);
  const supportCase = dashboard.supportCases.find((entry) => entry.id === supportId);

  return <section className="form-card editor-card">
    <h2>Business and customer support</h2>
    <div className="my-4 flex flex-wrap gap-2" aria-label="Business tools" role="group">
      {sections.map((section) => <button
        key={section.id}
        type="button"
        className={`button ${mode === section.id ? "button-green" : "button-outline"}`}
        aria-pressed={mode === section.id}
        disabled={saving}
        onClick={() => { resetMessages(); setMode(section.id); }}
      >{section.label}</button>)}
    </div>
    {mode === "reviews" && <label className="mb-4">Feedback record<select disabled={saving} value={reviewId} onChange={(event) => { resetMessages(); setReviewId(event.target.value); }}>
      <option value="">Add customer feedback</option>
      {dashboard.reviews.map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {entry.displayName || entry.text.slice(0, 42)} · {entry.status}</option>)}
    </select></label>}
    {mode === "support" && <label className="mb-4">Support case<select disabled={saving} value={supportId} onChange={(event) => { resetMessages(); setSupportId(event.target.value); }}>
      <option value="">Log a new support case</option>
      {dashboard.supportCases.map((entry) => <option key={entry.id} value={entry.id}>{entry.reference} · {entry.status.replace("_", " ")}</option>)}
    </select></label>}
    <form key={`${mode}:${reviewId}:${supportId}:${dashboard.version}`} onSubmit={save}>
      <fieldset disabled={saving}>
        {mode === "details" && <>
          <p className="muted mb-4">Enter only approved public information. Leaving a field blank hides it or uses the existing configured contact.</p>
          <div className="form-grid">
            {detailFields.map(({ name, label, limit, type, multiline }) => <label key={name}>{label}
              {multiline
                ? <textarea name={name} rows={3} maxLength={limit} defaultValue={dashboard.business[name]}/>
                : <input name={name} type={type ?? "text"} maxLength={limit} required={name === "tradingName"} defaultValue={dashboard.business[name]}/>}
            </label>)}
          </div>
        </>}
        {mode === "reviews" && <>
          <p className="muted mb-4">Record feedback actually provided by a customer. Only reviews approved with permission appear in the store.</p>
          <div className="form-grid">
            <label>Date received<input type="date" name="date" required defaultValue={review?.date}/></label>
            <label>Product ID <span className="optional">(optional)</span><input name="productId" maxLength={80} defaultValue={review?.productId}/></label>
            <label>Display name <span className="optional">(optional)</span><input name="displayName" maxLength={90} defaultValue={review?.displayName}/></label>
            <label>Customer’s rating<select name="rating" defaultValue={review?.rating ?? ""}><option value="">No rating provided</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number} out of 5</option>)}</select></label>
            <label className="field-wide">Customer’s feedback<textarea name="text" rows={4} required minLength={10} maxLength={1200} defaultValue={review?.text}/></label>
            <label>Approved photo URL <span className="optional">(optional)</span><input type="url" name="photoUrl" maxLength={1000} defaultValue={review?.photoUrl}/></label>
            <label>Photo description<input name="photoAlt" maxLength={160} defaultValue={review?.photoAlt}/></label>
            <label>Moderation status<select name="status" defaultValue={review?.status ?? "pending"}><option value="pending">Pending review</option><option value="approved">Approved for the storefront</option><option value="hidden">Hidden</option></select></label>
          </div>
          <div className="mt-4 grid gap-2">
            <label className="check-label"><input type="checkbox" name="publishPermission" defaultChecked={review?.publishPermission}/> The customer agreed to publication of their feedback.</label>
            <label className="check-label"><input type="checkbox" name="identityPermission" defaultChecked={review?.identityPermission}/> The customer agreed to publication of the name or photo provided here.</label>
          </div>
        </>}
        {mode === "support" && <>
          <p className="muted mb-4">Log issues received through customer service. Use the reference and details needed to resolve the issue.</p>
          <div className="form-grid">
            <label>Order, quote or case reference<input name="reference" minLength={2} maxLength={90} required defaultValue={supportCase?.reference}/></label>
            <label>Case status<select name="status" defaultValue={supportCase?.status ?? "open"}><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option></select></label>
            <label className="field-wide">Issue summary<textarea name="summary" rows={3} minLength={5} maxLength={500} required defaultValue={supportCase?.summary}/></label>
            <label className="field-wide">Resolution notes<textarea name="resolution" rows={3} maxLength={500} defaultValue={supportCase?.resolution}/></label>
          </div>
        </>}
      </fieldset>
      {error && <div className="mt-3">
        <p className="form-error" role="alert">{error}</p>
        <button className="text-link mt-2" type="button" onClick={reload}>Reload saved information</button>
      </div>}
      {notice && <p className="inline-notice mt-3" role="status">{notice}</p>}
      <button className="button button-green mt-4" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
    </form>
  </section>;
}
