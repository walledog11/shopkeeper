import type { ReactNode } from "react";

/** Section eyebrow: mono caps behind a coral dot. Centered by default; pass
 *  `align="start"` for left-aligned section headers. */
export function SectionLabel({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div className={`mb-5 flex ${align === "center" ? "justify-center" : "justify-start"}`}>
      <span className="m-eyebrow">{children}</span>
    </div>
  );
}
