import Link from "next/link";
import { Store } from "lucide-react";
import { CONTACT_EMAIL, PRODUCT_NAME } from "@/lib/brand";

const COPYRIGHT_YEAR = 2026;

const footerGroups = [
  {
    label: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/product/security", label: "Security" },
    ],
  },
  {
    label: "Company",
    links: [
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
    <footer data-nav-dark className="m-chapter m-chapter--dark px-5 pb-10 sm:px-8">
      <div className="mx-auto max-w-6xl border-t border-[color:var(--m-line)] pt-14">
        <div className="grid gap-12 md:grid-cols-[1fr_2fr]">
          <Link href="/" aria-label={PRODUCT_NAME} className="m-nav-logo self-start">
            <Store className="size-7" strokeWidth={1.75} aria-hidden />
            <span className="m-nav-wordmark" aria-hidden>
              {PRODUCT_NAME.toLowerCase()}
            </span>
          </Link>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.label}>
                <h2 className="text-[13px] font-medium text-[color:var(--m-ink-3)]">{group.label}</h2>
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

        <p className="mt-14 text-[13px] text-[color:var(--m-ink-3)]">
          © {COPYRIGHT_YEAR} {PRODUCT_NAME}
        </p>
      </div>
    </footer>
  );
}
