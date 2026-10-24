import type { CSSProperties } from "react";

/** Hero-style entrance animation using the shared `m-rise` keyframe. */
export function marketingRiseStyle(delayMs: number): CSSProperties {
  return {
    animation: "m-rise 0.7s ease-out both",
    animationDelay: `${delayMs}ms`,
  };
}

/** Shared easing for motion/react marketing sections. */
export const marketingMotionEase = [0.22, 1, 0.36, 1] as const;
