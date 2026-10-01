/** Which scene the menu's preview panel shows while a row is active. */
export type PreviewKind = "text" | "support" | "approvals" | "integrations";

export type ProductCard = {
  href: string;
  title: string;
  subtitle: string;
  preview: PreviewKind;
};

export const productCards: ProductCard[] = [
  {
    href: "/#workflow",
    title: "Text your shopkeeper",
    subtitle: "Check stock, run a sale, or change an order, all by text.",
    preview: "text",
  },
  {
    href: "/#customers",
    title: "Customer support",
    subtitle: "Replies that use the order, your policies, and your voice.",
    preview: "support",
  },
  {
    href: "/product/approvals-and-controls",
    title: "Approvals and controls",
    subtitle: "Set what it does alone, what it asks first, and what’s off limits.",
    preview: "approvals",
  },
  {
    href: "/product/integrations",
    title: "Integrations",
    subtitle: "Shopify, Instagram, email, and iMessage: what each one is for.",
    preview: "integrations",
  },
];

export const logos = {
  shopify: "/logos/shopify.svg",
  instagram: "/logos/instagram-outline.svg",
} as const;
