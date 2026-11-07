import Image from "next/image";

// The four steps of onboarding (`STEPS` in the onboarding model): the store, the
// customer channels, the phone, then a practice draft from an imported policy.
const steps = [
  {
    title: "Connect Shopify",
    body: "It reads your orders and products, and imports your policies and pages.",
    logos: [{ src: "/logos/shopify.svg", width: 22, height: 25 }],
  },
  {
    title: "Connect your inbox",
    body: "Instagram DMs, plus Gmail or any support address you forward.",
    logos: [
      { src: "/logos/instagram-logo.png", width: 24, height: 24 },
      { src: "/logos/gmail.png", width: 24, height: 24 },
    ],
  },
  {
    title: "Link your iPhone",
    body: "Scan a code, and its texts arrive in iMessage.",
    logos: [{ src: "/logos/imessage.svg", width: 26, height: 26 }],
  },
  {
    title: "Try a practice draft",
    body: "See how it answers from your own policies before a customer does.",
    logos: [{ src: "/logos/shopkeeper-shop-logo.png", width: 26, height: 26 }],
  },
] as const;

export function Setup() {
  return (
    <section aria-labelledby="setup-heading" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <h2 id="setup-heading" className="m-display m-h2">Up and running in four steps.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">It works with the store, inbox and phone you already have.</p>
      </div>

      <ol className="m-steps mt-12 sm:mt-14">
        {steps.map((step, index) => (
          <li key={step.title} className="m-step">
            <div className="m-step-top">
              <span className="m-step-logos">
                {step.logos.map((logo) => (
                  <span key={logo.src} className="m-step-logo">
                    <Image src={logo.src} alt="" width={logo.width} height={logo.height} />
                  </span>
                ))}
              </span>
              <span aria-hidden className="m-step-num">{index + 1}</span>
            </div>
            <div className="m-step-copy">
              <h3 className="text-[17px] font-medium text-[color:var(--m-ink)]">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
