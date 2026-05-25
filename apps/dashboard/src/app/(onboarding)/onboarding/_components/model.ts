import { AtSign, Camera, ShoppingBag } from "lucide-react";
import type { AutonomyTier } from "@/lib/agent/settings";

export type { AutonomyTier };

export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "concierge-onboarding-v1";
export const POPUP_NAME = "clerk_oauth_popup";
export type StepId = "intro" | "store" | "shopify" | "channels" | "autonomy" | "plan";
export type ChannelKey = "email" | "ig_dm" | "shopify";

export interface OnboardingData {
  storeName: string;
  sells: string;
  founderName: string;
  primaryEmail: string;
  autonomy: AutonomyTier;
}

export type IntegrationRow = {
  platform: string;
  externalAccountId: string;
  fromEmail: string | null;
  lastActivity?: string | null;
};

export const DEFAULT_DATA: OnboardingData = {
  storeName: "",
  sells: "",
  founderName: "",
  primaryEmail: "",
  autonomy: "trusted",
};

export const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "intro",    label: "Meet me" },
  { id: "store",    label: "Your store" },
  { id: "shopify",  label: "Shopify" },
  { id: "channels", label: "Channels" },
  { id: "autonomy", label: "My limits" },
  { id: "plan",     label: "First night" },
];

export const AUTONOMY_TIERS: Array<{ id: AutonomyTier; label: string; cap: number; blurb: string; recommended?: boolean }> = [
  { id: "watch",   label: "Watch only",  cap: 0,    blurb: "I'll draft every reply for you. You hit send." },
  { id: "guarded", label: "Guarded",     cap: 50,   blurb: "I send WISMO and KB-backed replies. Anything > $50 needs you." },
  { id: "trusted", label: "Trusted",     cap: 100,  blurb: "Refunds up to $100, exchanges, address changes. Bulk inquiries pause for you.", recommended: true },
  { id: "broad",   label: "Broad",       cap: 250,  blurb: "Refunds up to $250, bulk quotes, custom discount codes." },
  { id: "full",    label: "Full auto",   cap: 1000, blurb: "I act on anything in policy. You only see exceptions." },
];

export const CHANNEL_META: Array<{ key: ChannelKey; label: string; description: string; Icon: typeof AtSign }> = [
  { key: "email",   label: "Email",        description: "Primary channel for most stores. I read, draft, and send.", Icon: AtSign },
  { key: "ig_dm",   label: "Instagram DM", description: "DMs, story replies, and tag mentions.",                     Icon: Camera },
  { key: "shopify", label: "Shopify",      description: "Customer messages from your storefront and admin.",         Icon: ShoppingBag },
];
