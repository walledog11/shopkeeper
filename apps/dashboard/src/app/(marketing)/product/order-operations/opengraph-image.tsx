import { createProductOpenGraph, productOpenGraphSize } from "../../_components/ProductOpenGraph";

export const alt = "Shopkeeper order operations — customer support that can finish the Shopify work";
export const size = productOpenGraphSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createProductOpenGraph({
    eyebrow: "order operations",
    title: "Customer support that can finish the Shopify work.",
    tags: ["Address fixes", "Item swaps", "Refunds within limits"],
    accent: "#b0472f",
  });
}
