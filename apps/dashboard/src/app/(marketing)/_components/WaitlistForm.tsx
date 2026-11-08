"use client";

import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { track } from "@vercel/analytics";
import { Check, LoaderCircle } from "lucide-react";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";
import { WAITLIST_CHANNELS, WAITLIST_VOLUMES } from "@/lib/waitlist-profile";
import { cn } from "@/lib/ui/cn";
import { marketingButtonClass } from "./ButtonLink";

type Step = "email" | "store" | "done";

async function sendWaitlist(method: "POST" | "PATCH", body: object): Promise<{ confirmationRequired?: boolean }> {
  const response = await fetch("/api/waitlist", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.error || "We couldn’t save that. Please try again.");
  }
  return result;
}

function failureMessage(cause: unknown) {
  return cause instanceof Error && cause.name !== "TimeoutError" && cause.name !== "TypeError"
    ? cause.message
    : "We couldn’t connect. Please try again in a moment.";
}

export function WaitlistForm({
  source,
  dark = false,
  align = "start",
}: {
  source: "hero" | "footer";
  dark?: boolean;
  align?: "start" | "center";
}) {
  const id = useId();
  const busy = useRef(false);
  const storeHeading = useRef<HTMLParagraphElement>(null);
  const [step, setStep] = useState<Step>("email");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  useEffect(() => {
    if (step === "store") storeHeading.current?.focus();
  }, [step]);

  async function run(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function submitEmail(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams(window.location.search);
    const attribution = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign"].map((key) => [key, query.get(key)?.slice(0, 200) ?? ""]),
    );
    const address = String(form.get("email") ?? "");
    void run(async () => {
      const result = await sendWaitlist("POST", {
        email: address,
        company: form.get("company"),
        newsletterOptIn: form.get("newsletter") === "on",
        source,
        attribution,
      });
      track("Early access requested", { source });
      setEmail(address);
      setConfirmationRequired(result.confirmationRequired === true);
      setStep("store");
    });
  }

  function submitStore(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await sendWaitlist("PATCH", {
        email,
        storeUrl: form.get("storeUrl"),
        channels: form.getAll("channels"),
        weeklyMessages: form.get("weeklyMessages"),
      });
      track("Store details sent", { source });
      setStep("done");
    });
  }

  const nextNote = confirmationRequired
    ? "Confirm your email from the message in your inbox."
    : "We’ll email you when your spot opens.";
  const chipClass = cn(
    "inline-flex min-h-9 cursor-pointer items-center rounded-full border border-[color:var(--m-line-strong)] px-3.5 text-[14px] text-[color:var(--m-ink-2)] transition-colors",
    "hover:border-[color:var(--m-ink-3)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--m-focus)]",
    dark
      ? "peer-checked:border-transparent peer-checked:bg-[color:var(--m-on-dark)] peer-checked:text-[color:var(--m-dark)]"
      : "peer-checked:border-transparent peer-checked:bg-[color:var(--m-dark)] peer-checked:text-[color:var(--m-on-dark)]",
  );
  const labelClass = "mb-2 block text-[13px] font-medium text-[color:var(--m-ink)]";

  return (
    <div className={cn("m-waitlist", dark && "m-waitlist--dark", align === "center" && "m-waitlist--center")}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {step === "done" ? (
          <div className="m-waitlist-success">
            <Check size={19} aria-hidden="true" />
            <div>
              <strong>You’re on the list.</strong>
              <p>{nextNote}</p>
            </div>
          </div>
        ) : null}
      </div>

      {step === "email" ? (
        <form onSubmit={submitEmail} aria-label={PRIMARY_CTA_LABEL}>
          <div className="m-waitlist-fields">
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Your email"
              required
              maxLength={254}
              disabled={saving}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            <button
              type="submit"
              className={marketingButtonClass({ size: "lg", variant: dark ? "light" : "primary" })}
              disabled={saving}
            >
              {saving ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-label="Sending" /> : PRIMARY_CTA_LABEL}
            </button>
          </div>
          <label className="m-waitlist-opt-in">
            <input type="checkbox" name="newsletter" disabled={saving} />
            <span>Send me occasional product updates, too.</span>
          </label>
          <div className="m-waitlist-trap" aria-hidden="true">
            <label htmlFor={`${id}-company`}>Leave this empty</label>
            <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
          </div>
          {error ? <p id={`${id}-error`} role="alert" className="m-waitlist-error">{error}</p> : null}
        </form>
      ) : null}

      {step === "store" ? (
        <form onSubmit={submitStore} className="m-waitlist-panel" aria-labelledby={`${id}-store-title`}>
          <p
            id={`${id}-store-title`}
            ref={storeHeading}
            tabIndex={-1}
            className="flex items-center gap-2 text-[15px] font-medium text-[color:var(--m-ink)] outline-none"
          >
            <Check size={17} aria-hidden="true" className="text-[color:var(--m-good)]" />
            You’re on the list.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-[color:var(--m-ink-2)]">
            {nextNote} Meanwhile, tell us a little about your store.
          </p>

          <div className="mt-5 grid gap-5">
            <div>
              <label htmlFor={`${id}-store`} className={labelClass}>Store website</label>
              <input
                id={`${id}-store`}
                name="storeUrl"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="yourstore.com"
                required
                maxLength={255}
                disabled={saving}
                className="m-waitlist-input"
              />
            </div>
            <fieldset disabled={saving}>
              <legend className={labelClass}>Where customers message you</legend>
              <div className="flex flex-wrap gap-2">
                {WAITLIST_CHANNELS.map((channel) => (
                  <label key={channel.code}>
                    <input type="checkbox" name="channels" value={channel.code} className="peer sr-only" />
                    <span className={chipClass}>{channel.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={saving}>
              <legend className={labelClass}>Messages a week</legend>
              <div className="flex flex-wrap gap-2">
                {WAITLIST_VOLUMES.map((volume) => (
                  <label key={volume.code}>
                    <input type="radio" name="weeklyMessages" value={volume.code} className="peer sr-only" />
                    <span className={chipClass}>{volume.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button
              type="submit"
              className={marketingButtonClass({ variant: dark ? "light" : "primary" })}
              disabled={saving}
            >
              {saving ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-label="Sending" /> : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setStep("done")}
              disabled={saving}
              className={marketingButtonClass({ variant: dark ? "ghost" : "outline" })}
            >
              Skip
            </button>
          </div>
          {error ? <p role="alert" className="m-waitlist-error">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
