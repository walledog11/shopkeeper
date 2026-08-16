import type { ActionEntry } from "@shopkeeper/agent/context";
import {
  DASHBOARD_DESTINATIONS,
  NAVIGATE_DASHBOARD_TOOL,
  parseNavigateDashboardResult,
  type DashboardDestination,
  type NavigateDashboardPayload,
} from "@shopkeeper/agent/dashboard-destinations";

const QUESTION_PATTERN = /\b(what|how|why|when|who|which|any|anything|is there|are there|do i have|tell me about|explain)\b/;
const NAV_VERB_PATTERN = /\b(take me|bring me|go to|open|navigate|switch to|pull up|show me the|show me my|head to|jump to)\b/;
const SETUP_PATTERN = /\b(add|connect|set up|setup|change|update|configure|edit)\b/;
const EXPLICIT_PAGE_PATTERN = /\b(integrations page|settings page|agent settings|trust level|workspace settings)\b/;
const AGENT_TASK_PATTERN = /\b(summarize|summarise|summary|recap|overview|list|draft|reply|look up|lookup|find|check|status)\b/;
const PAGE_LOOKUP_PATTERN = /\b(how many|how much|count of|number of)\b/;

function normalizeInstruction(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeNavigationIntent(normalized: string): boolean {
  if (!normalized) return false;
  if (AGENT_TASK_PATTERN.test(normalized)) return false;
  if (looksLikePageLookupQuestion(normalized)) return true;
  if (QUESTION_PATTERN.test(normalized) && !NAV_VERB_PATTERN.test(normalized)) {
    return false;
  }
  return NAV_VERB_PATTERN.test(normalized)
    || SETUP_PATTERN.test(normalized)
    || EXPLICIT_PAGE_PATTERN.test(normalized);
}

/** Count-style questions about a dashboard page surface, e.g. "how many open orders". */
function looksLikePageLookupQuestion(normalized: string): boolean {
  if (AGENT_TASK_PATTERN.test(normalized)) return false;
  if (!PAGE_LOOKUP_PATTERN.test(normalized)) return false;
  return DASHBOARD_DESTINATIONS.some((destination) => scoreDestination(destination, normalized) >= 10);
}

function pickBestDestination(normalized: string): NavigateDashboardPayload | null {
  let best: { destination: DashboardDestination; score: number } | null = null;

  for (const destination of DASHBOARD_DESTINATIONS) {
    const score = scoreDestination(destination, normalized);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { destination, score };
    }
  }

  if (!best || best.score < 10) return null;

  return {
    type: "navigate",
    href: best.destination.href,
    label: best.destination.label,
  };
}

/** True when the merchant is asking to go somewhere, not to do agent work in chat. */
export function isConciergeNavigationRequest(instruction: string): boolean {
  return looksLikeNavigationIntent(normalizeInstruction(instruction));
}

function scoreDestination(destination: DashboardDestination, normalized: string): number {
  let score = 0;

  for (const keyword of destination.keywords) {
    const normalizedKeyword = normalizeInstruction(keyword);
    if (!normalizedKeyword) continue;
    if (normalized.includes(normalizedKeyword)) {
      score += normalizedKeyword.split(" ").length * 10 + normalizedKeyword.length;
    }
  }

  const normalizedLabel = normalizeInstruction(destination.label);
  if (normalizedLabel && normalized.includes(normalizedLabel)) {
    score += normalizedLabel.split(" ").length * 10 + normalizedLabel.length;
  }

  return score;
}

export function matchConciergeNavigationIntent(instruction: string): NavigateDashboardPayload | null {
  const normalized = normalizeInstruction(instruction);
  if (!looksLikeNavigationIntent(normalized)) return null;
  return pickBestDestination(normalized);
}

export function extractConciergeNavigation(actions: ActionEntry[]): NavigateDashboardPayload | null {
  for (const action of actions) {
    if (action.tool !== NAVIGATE_DASHBOARD_TOOL) continue;
    const payload = parseNavigateDashboardResult(action.result);
    if (payload) return payload;
  }
  return null;
}

export type { NavigateDashboardPayload } from "@shopkeeper/agent/dashboard-destinations";
