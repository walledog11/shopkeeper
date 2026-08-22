import { CHANNEL_TYPE } from "./thread-constants.js";

/**
 * What we call the person a merchant is being told about.
 *
 * This used to be answered independently on five surfaces, and only two of them
 * read verification state — which is how a shopper who had proved they owned
 * #1024 was listed in the morning briefing as an unidentified visitor while the
 * operator card for the same thread said they had confirmed the email on it.
 *
 * The rule lives here once. What differs between surfaces is register, not the
 * rule: a briefing lists names, a card writes sentences, and English wants a
 * different case at the start of one than in the middle. So there is one
 * classifier and three renderers, and no surface re-derives who this is.
 */
export type PersonName =
  /** They told us their name. */
  | { kind: "named"; firstName: string }
  /**
   * Storefront chat, and they entered a code mailed to the address on an order.
   * That proves they are the customer on *that order* — never that they own an
   * account — so the rendering names the orders and nothing wider.
   */
  | { kind: "verified"; orders: readonly string[] }
  /** Storefront chat, nobody has identified them. */
  | { kind: "visitor" }
  /** No name, and the channel does not tell us anything either. */
  | { kind: "unknown" };

/**
 * Nobody on storefront chat has identified themselves, so there is no name to
 * print — but "Someone" twice in one list says less than the channel does.
 */
export const STOREFRONT_VISITOR_LABEL = "Storefront visitor";

export function customerFirstName(customerName: string | null | undefined): string | null {
  const trimmed = customerName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function classifyPerson(input: {
  customerName: string | null | undefined;
  channelType: string | null | undefined;
  verifiedOrders?: readonly string[];
  /**
   * The text this name introduces, when the caller has it. An order named here
   * as well as in the sentence prints it twice — "The customer on #1024
   * requested a refund … on order #1024" — and the sentence is the better place
   * for it.
   */
  followingText?: string;
}): PersonName {
  const firstName = customerFirstName(input.customerName);
  // "Customer" is a platform placeholder, not a name; printing it back at the
  // merchant reads as though we know something we do not.
  if (firstName && firstName.toLowerCase() !== "customer") return { kind: "named", firstName };
  if (input.channelType !== CHANNEL_TYPE.SHOPIFY_CHAT) return { kind: "unknown" };

  const verifiedOrders = input.verifiedOrders ?? [];
  if (verifiedOrders.length === 0) return { kind: "visitor" };

  const following = input.followingText ?? "";
  return {
    kind: "verified",
    orders: verifiedOrders.filter((order) => !following.includes(order.replace("#", ""))),
  };
}

/**
 * A name in a list or a row — the briefing's waiting items, a ticket row.
 * Null when there is nothing to say, so the caller can fall back to whatever
 * else identifies the thread (an order reference, usually) before "Someone".
 */
export function personLabel(person: PersonName): string | null {
  switch (person.kind) {
    case "named":
      return person.firstName;
    case "verified":
      return person.orders.length > 0 ? `The customer on ${person.orders.join(", ")}` : "The customer";
    case "visitor":
      return STOREFRONT_VISITOR_LABEL;
    case "unknown":
      return null;
  }
}

/**
 * The subject of a sentence the merchant reads. An anonymous storefront visitor
 * is not "the customer": nobody has identified them, they may have bought
 * nothing, and on that channel they can type any name they like — calling them
 * a customer asserts a relationship the merchant does not have and the agent
 * cannot check.
 */
export function personSubject(person: PersonName): string {
  return person.kind === "visitor" ? "Someone on your storefront" : personLabel(person) ?? "The customer";
}

/** The same person after a preposition: "Reply to …", "for …". */
export function personObject(person: PersonName): string {
  if (person.kind === "visitor") return "the visitor";
  const label = personLabel(person);
  if (!label) return "the customer";
  return person.kind === "named" ? label : `the${label.slice("The".length)}`;
}
