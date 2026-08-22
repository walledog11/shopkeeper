import { createProductOpenGraph, productOpenGraphSize } from "../../_components/ProductOpenGraph";

export const alt = "Shopkeeper integrations — every connection has one clear job";
export const size = productOpenGraphSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createProductOpenGraph({
    eyebrow: "integrations",
    title: "Every connection has one clear job.",
    tags: ["Customer intake", "Merchant control", "Shopify execution"],
    accent: "#2f7a4a",
  });
}
