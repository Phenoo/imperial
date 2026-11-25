import { useRef, useState } from "react";
import { Copy, Link2, MessageCircle } from "lucide-react";
import type { User } from "firebase/auth";
import { staffRequest } from "@/lib/admin-client";
import type { CatalogueInvite } from "@/lib/catalogue-invite";

const date = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

export function CatalogueShare({ user, invite, onInviteChange, disabled = false }: {
  user: User;
  invite: CatalogueInvite | null | undefined;
  onInviteChange: (invite: CatalogueInvite | null) => void;
  disabled?: boolean;
}) {
  const [link, setLink] = useState<{ url: string; createdAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);
  const linkInput = useRef<HTMLInputElement>(null);

  const active = invite?.status === "active";
  const shareUrl = active && link?.createdAt === invite.createdAt ? link.url : null;
  const waMessage = `Please use this Imperial Foods & Beverages form to enter prices, pack sizes and stock for the products you know. Save your changes when you’re ready.\n\n${shareUrl}`;
  const unavailable = disabled || busy || invite === undefined;

  async function changeInvite(action: "create" | "revoke") {
    if (unavailable || running.current) return;
    if (active && !window.confirm(action === "create"
      ? "Replace this link? The current link will stop working immediately."
      : "Revoke this link? Recipients will lose access immediately. Submitted updates will stay available for review.")) return;

    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "revoke") {
        const result = await staffRequest<{ invite: CatalogueInvite | null }>(user, "catalogue/invite", { method: "DELETE" });
        setLink(null);
        onInviteChange(result.invite);
        setNotice("Link revoked. Submitted updates are still available for review.");
      } else {
        const result = await staffRequest<{ invite: CatalogueInvite; token: string }>(user, "catalogue/invite", { method: "POST" });
        const url = new URL("/catalogue-update", window.location.origin);
        url.hash = result.token;
        setLink({ url: url.href, createdAt: result.invite.createdAt });
        onInviteChange(result.invite);
        setNotice("Your link is ready to share.");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Couldn’t update the link. Try again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    setNotice("");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Link copied.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setNotice("Copy the link from the selected field.");
    }
  }

  return <section className="form-card mb-5" aria-labelledby="catalogue-share-heading">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 id="catalogue-share-heading"><Link2 size={21} aria-hidden="true"/> Share catalogue form</h2>
      {invite && <span className={`admin-badge ${active ? "status-confirmed" : ""}`}>
        {active ? "Link active" : invite.status === "expired" ? "Link expired" : "Link revoked"}
      </span>}
    </div>
    <p className="muted text-sm">Invite people to enter prices, pack sizes and stock on their phones. Their updates are saved for staff review.</p>
    {active && <p className="mt-2 text-sm font-semibold">
      Expires <time dateTime={invite.expiresAt}>{date.format(new Date(invite.expiresAt))}</time> WAT
    </p>}
    {invite === undefined && <p className="muted mt-2 text-sm">Link controls are available after the link status loads.</p>}
    {active && !shareUrl && <p className="muted mt-2 text-sm">Use the link you already shared, or create a replacement to copy a new one.</p>}
    {shareUrl && <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label>Shareable link
        <input ref={linkInput} value={shareUrl} readOnly spellCheck={false} autoComplete="off"/>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-outline" onClick={copyLink} disabled={unavailable}><Copy size={17} aria-hidden="true"/> Copy link</button>
        {!unavailable && <a className="button button-green" href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} aria-hidden="true"/> Share on WhatsApp
        </a>}
      </div>
    </div>}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" className={`button ${active ? "button-outline" : "button-green"}`} onClick={() => changeInvite("create")} disabled={unavailable}>
        {active ? "Create replacement link" : "Create share link"}
      </button>
      {active && <button type="button" className="button button-outline" onClick={() => changeInvite("revoke")} disabled={unavailable}>Revoke link</button>}
    </div>
    {busy && <p role="status" className="muted mt-2 text-sm">Updating link…</p>}
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {error && <p role="alert" className="form-error mt-2 text-sm">{error}</p>}
  </section>;
}
