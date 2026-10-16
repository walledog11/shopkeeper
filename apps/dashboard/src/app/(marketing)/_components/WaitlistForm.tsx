"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";

export function WaitlistForm({ source, dark = false }: { source: "hero" | "footer"; dark?: boolean }) {
  const id = useId();
  const submitting = useRef(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = new FormData(event.currentTarget);
    setState("saving");
    setError("");
    const query = new URLSearchParams(window.location.search);
    const attribution = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign"].map((key) => [key, query.get(key)?.slice(0, 200) ?? ""]));

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), company: form.get("company"), newsletterOptIn: form.get("newsletter") === "on", source, attribution }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) {
        throw new Error(result?.error || "We couldn’t save your email. Please try again.");
      }
      setConfirmationRequired(result.confirmationRequired === true);
      setState("saved");
    } catch (cause) {
      setState("idle");
      setError(cause instanceof Error && cause.name !== "TimeoutError" && cause.name !== "TypeError"
        ? cause.message : "We couldn’t connect. Please try again in a moment.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className={`m-waitlist${dark ? " m-waitlist--dark" : ""}`}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state === "saved" && (
          <div className="m-waitlist-success">
            <Check size={19} aria-hidden="true" />
            <div><strong>You’re on the list.</strong><p>{confirmationRequired ? "Look out for an email to confirm your subscription." : "We’ll email you when early access opens."}</p></div>
          </div>
        )}
      </div>
      {state !== "saved" && (
        <form onSubmit={submit} aria-label={`Join the waitlist (${source})`}>
          <div className="m-waitlist-fields">
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input
              id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email"
              placeholder="Your email address" required maxLength={254} disabled={state === "saving"}
              aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-note`}
            />
            <button type="submit" className={`m-btn m-btn-lg ${dark ? "m-btn-light" : "m-btn-primary"}`} disabled={state === "saving"}>
              {state === "saving" ? <><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Joining…</> : PRIMARY_CTA_LABEL}
            </button>
          </div>
          <label className="m-waitlist-opt-in">
            <input type="checkbox" name="newsletter" disabled={state === "saving"} />
            <span>Send me occasional product updates, too.</span>
          </label>
          <div className="m-waitlist-trap" aria-hidden="true">
            <label htmlFor={`${id}-company`}>Leave this empty</label>
            <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p id={`${id}-error`} role="alert" className="m-waitlist-error">{error}</p>}
          <p id={`${id}-note`} className="m-waitlist-note">We’ll email you about early access. <Link href="/privacy">Privacy</Link></p>
        </form>
      )}
    </div>
  );
}
