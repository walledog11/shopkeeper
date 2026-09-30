import { ButtonLink } from "./ButtonLink";
import { Reveal } from "./Reveal";
import { PRIMARY_CTA_LABEL } from "@/lib/brand";

/* Concentric line art rising from the bottom edge, drawn in the chapter's own
   line token so it stays quiet. */
function CtaArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 600"
      fill="none"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-white/[0.07]"
    >
      {[200, 300, 400, 500, 600].map((r) => (
        <circle key={r} cx="600" cy="640" r={r} stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export function CTA() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="m-chapter m-chapter--dark relative isolate overflow-hidden px-5 py-24 text-center sm:px-6 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_50%_112%,rgba(236,107,79,0.2)_0%,transparent_70%)]"
      />
      <CtaArt />
      <Reveal className="mx-auto max-w-3xl">
        <h2 id="cta-heading" className="m-display m-h1 mx-auto mb-5 max-w-[16ch]">
          Give your shop a shopkeeper.
        </h2>
        <p className="m-lede mx-auto mb-9 max-w-[46ch]">
          Connect Shopify, add your store’s instructions, and give it its first job.
          A stock check, an order change, or the customer inbox waiting for you.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/signup" variant="light" size="lg">
            {PRIMARY_CTA_LABEL}
          </ButtonLink>
          <ButtonLink href="/#workflow" variant="ghost" size="lg">
            See what you can ask
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
