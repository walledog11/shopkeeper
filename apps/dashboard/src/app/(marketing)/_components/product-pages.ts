/** Canonical product marketing routes — keep footer and cross-links aligned. */
export const productPages = [
  { href: "/product/order-operations", label: "Order operations" },
  { href: "/product/customer-support", label: "Customer support" },
  { href: "/product/approvals-and-controls", label: "Approvals and controls" },
  { href: "/product/integrations", label: "Integrations" },
  { href: "/product/security", label: "Security" },
] as const;

export type ProductPageHref = (typeof productPages)[number]["href"];
