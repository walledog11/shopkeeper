import { WaitlistForm } from "./WaitlistForm";

export function CTA() {
  return (
    <section aria-labelledby="cta-heading" data-nav-dark className="m-chapter m-chapter--dark m-cta-night">
      <span aria-hidden className="m-night-stars" />
      <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <h2 id="cta-heading" className="m-display m-h1 mx-auto max-w-[16ch]">Give your shop a shopkeeper.</h2>
        <p className="m-lede mx-auto mt-5 max-w-[40ch] text-[1.125rem]">
          We’re onboarding a few Shopify stores at a time.
        </p>
        <div className="mt-10 flex justify-center">
          <WaitlistForm source="footer" dark align="center" />
        </div>
      </div>
    </section>
  );
}
