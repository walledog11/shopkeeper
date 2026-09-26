import {
  MessageCircle,
  ShieldCheck,
  Store,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type ProductCard = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

export type Partner = {
  href: string;
  name: string;
  logo: string;
};

export const productCards: ProductCard[] = [
  {
    href: "/#night",
    title: "A night with Shopkeeper",
    subtitle: "Customers answered overnight, and a morning briefing you approve by text.",
    icon: Store,
  },
  {
    href: "/product/customer-support",
    title: "Customer support",
    subtitle: "Answer from orders, inventory, policies, and approved voice guidance.",
    icon: MessageCircle,
  },
  {
    href: "/product/approvals-and-controls",
    title: "Approvals and controls",
    subtitle: "Set the rules for what can reply, what must ask, and what stays blocked.",
    icon: ShieldCheck,
  },
  {
    href: "/product/integrations",
    title: "Integrations",
    subtitle: "Follow a request from the customer channel to Shopify and the action log.",
    icon: Workflow,
  },
];

export const partners: Partner[] = [
  { href: "/product/integrations", name: "Shopify", logo: "/logos/shopify.svg" },
  { href: "/product/integrations", name: "Instagram", logo: "/logos/instagram-outline.svg" },
  { href: "/product/integrations", name: "Email", logo: "/logos/email.svg" },
  { href: "/product/integrations", name: "iMessage", logo: "/logos/imessage.svg" },
];
