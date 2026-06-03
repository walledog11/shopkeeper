import { formatOpenCount } from "./sidebar-helpers";

export function OpenCountBadge({
  openCount,
  className,
  animate = false,
}: {
  openCount: number;
  className: string;
  animate?: boolean;
}) {
  if (openCount <= 0) return null;

  return (
    <span key={animate ? openCount : "open-count"} className={className}>
      {formatOpenCount(openCount)}
    </span>
  );
}
