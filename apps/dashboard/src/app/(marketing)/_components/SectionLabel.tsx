import type { ReactNode } from "react";

/** Shared section kicker. Quiet uppercase sans — not a handwritten masthead. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex justify-center">
      <p className="m-kicker">{children}</p>
    </div>
  );
}
