import Link from "next/link";
import { Store } from "lucide-react";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/brand";

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
    <footer className="m-chapter m-chapter--dark px-5 pb-10 sm:px-6">
      <div className="mx-auto max-w-6xl border-t border-[color:var(--m-line)] pt-14">
        <div className="grid gap-12 md:grid-cols-[1.1fr_2fr]">
          <div>
            <Link href="/" aria-label={PRODUCT_NAME} className="m-nav-logo">
              <Store className="size-7" strokeWidth={1.75} aria-hidden />
              <span className="m-nav-wordmark" aria-hidden>
                {PRODUCT_NAME.toLowerCase()}
              </span>
            </Link>
            <p className="mt-4 max-w-[26ch] text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">
              An AI agent for your Shopify store.
            </p>
          </div>

          <nav aria-label="Footer" className="grid gap-x-8 gap-y-10 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.label}>
                <h2 className="text-[12px] font-medium uppercase tracking-[0.04em] text-[color:var(--m-ink-3)] [font-family:var(--m-font-mono)]">
                  {group.label}
                </h2>
                <ul className="mt-3 text-[15px]">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-8 items-center text-[color:var(--m-ink-2)] transition-colors hover:text-[color:var(--m-ink)]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <p className="mt-14 border-t border-[color:var(--m-line)] pt-6 text-[13px] text-[color:var(--m-ink-3)]">
          © {COPYRIGHT_YEAR} {PRODUCT_NAME}
        </p>
      </div>
    </footer>
  );
}
