export function getCustomerName(
  customer: { name?: string | null; platformId?: string | null } | null | undefined
): string {
  if (customer?.name) return customer.name;

  const id = customer?.platformId;
  if (!id) return "Unknown Customer";
  if (id.includes("@")) return id;
  if (/^\d+$/.test(id)) return `Customer ${id.slice(-6)}`;

  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 40);
}
