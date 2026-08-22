import { createProductOpenGraph, productOpenGraphSize } from "../../_components/ProductOpenGraph";

export const alt = "Shopkeeper customer support — a useful answer starts with the store";
export const size = productOpenGraphSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createProductOpenGraph({
    eyebrow: "customer support",
    title: "A useful answer starts with the store.",
    tags: ["Shopify context", "Store policy", "Grounded reply"],
    accent: "#7351a6",
  });
}
