import { createProductOpenGraph, productOpenGraphSize } from "../../_components/ProductOpenGraph";

export const alt = "Shopkeeper security — control is a system, not a confirmation dialog";
export const size = productOpenGraphSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return createProductOpenGraph({
    eyebrow: "security",
    title: "Control is a system, not a confirmation dialog.",
    tags: ["Scoped access", "Action limits", "Reviewable history"],
    accent: "#2b4aa8",
  });
}
