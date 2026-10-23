import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { SectionLabel } from "./SectionLabel";
import { marketingSectionBodyClass, marketingSectionTitleClass } from "./marketingUi";

/** Centered or left-aligned section title + optional lede, shared across home sections. */
export function MarketingSectionHeader({
  title,
  body,
  eyebrow,
  align = "center",
  id,
  titleClassName,
  bodyClassName,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  eyebrow?: ReactNode;
  align?: "center" | "start";
  id?: string;
  titleClassName?: string;
  bodyClassName?: string;
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div className={cn(centered ? "text-center" : "text-left", className)}>
      {eyebrow ? <SectionLabel align={align}>{eyebrow}</SectionLabel> : null}
      <h2
        id={id}
        className={cn(marketingSectionTitleClass, !centered && "mx-0", titleClassName)}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            marketingSectionBodyClass,
            centered ? "mx-auto" : "mx-0",
            bodyClassName,
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
