import { STOREFRONT_VISITOR_LABEL } from "@shopkeeper/agent/person-name";

/**
 * A row label derived from what the platform gave us, not the naming rule —
 * `classifyPerson` answers "what do we call this person", and this answers the
 * narrower "we have no name, only a `platformId`, what goes in the column".
 */
export function getCustomerName(
  customer: { name?: string | null; platformId?: string | null } | null | undefined
): string {
  if (customer?.name) return customer.name;

  const id = customer?.platformId;
  if (!id) return "Unknown Customer";
  // A storefront guest is keyed on `shopify_chat:<session uuid>`. The title-casing
  // below turns that into "Shopify Chat:E36cd568-3053-…" and presents a session id
  // as the person's name. Nobody has identified them, so say that — matching the
  // "Someone on your storefront" / "the visitor" register the operator cards use.
  if (id.startsWith("shopify_chat:")) return STOREFRONT_VISITOR_LABEL;
  if (id.includes("@")) return id;
  if (/^\d+$/.test(id)) return `Customer ${id.slice(-6)}`;

  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 40);
}
