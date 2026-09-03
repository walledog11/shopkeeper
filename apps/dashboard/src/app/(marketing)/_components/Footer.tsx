import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/brand";

const COPYRIGHT_YEAR = 2026;

const footerGroups = [
  {
    label: "Product",
    links: [
      { href: "/product/order-operations", label: "Order operations" },
      { href: "/product/customer-support", label: "Customer support" },
      { href: "/product/approvals-and-controls", label: "Approvals and controls" },
      { href: "/product/integrations", label: "Integrations" },
      { href: "/product/security", label: "Security" },
    ],
  },
  {
    label: "Company",
    links: [
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
      { href: `mailto:${CONTACT_EMAIL}`, label: "Contact" },
    ],
  },
  {
    label: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/data-deletion", label: "Data deletion" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden px-6 pt-12">
      {/* Dawn-sky atmosphere wash behind the wordmark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[460px] [mask-image:linear-gradient(180deg,transparent_0%,black_58%)]"
      >
        <Image
          src="/atmosphere/footer-dawn.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[center_42%] [filter:sepia(0.08)_saturate(0.9)_brightness(1.04)]"
        />
        <div className="absolute inset-0 bg-[#f6f2eb]/25" />
        <div className="m-grain absolute inset-0" />
      </div>
      <div className="mx-auto max-w-6xl">
        <nav
          aria-label="Footer"
          className="grid gap-x-8 gap-y-7 border-b border-stone-900/10 pb-8 sm:grid-cols-3"
        >
          {footerGroups.map((group) => (
            <div key={group.label}>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                {group.label}
              </h2>
              <ul className="mt-3 space-y-2 text-[13px] text-stone-600">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-inherit transition-colors hover:text-stone-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="pt-6 text-[13px] text-stone-500">
          © {COPYRIGHT_YEAR} Shopkeeper · AI support operator for Shopify stores.
        </div>

        {/* Giant wordmark outro, descenders cropped by the page edge */}
        <div
          aria-hidden
          className="-mb-[0.26em] mt-2 select-none whitespace-nowrap text-center text-[clamp(72px,14.5vw,200px)] leading-none tracking-[0.03em] text-[#2b2118] [font-family:var(--m-hand)]"
        >
          shopkeeper
        </div>
      </div>
    </footer>
  );
}
