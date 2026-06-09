import { AtSign, Camera, ShoppingBag } from "lucide-react";
import type { AutonomyTier } from "@shopkeeper/agent/settings";
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers";

export type { AutonomyTier };
export { AUTONOMY_TIERS };

export const RETURN_TO = "/onboarding";
export const STORAGE_KEY = "concierge-onboarding-v1";
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

export const CHANNEL_META: Array<{ key: ChannelKey; label: string; description: string; Icon: typeof AtSign }> = [
  { key: "email",   label: "Email",        description: "Primary channel for most stores. I read, draft, and send.", Icon: AtSign },
  { key: "ig_dm",   label: "Instagram DM", description: "DMs, story replies, and tag mentions.",                     Icon: Camera },
  { key: "shopify", label: "Shopify",      description: "Customer messages from your storefront and admin.",         Icon: ShoppingBag },
];
