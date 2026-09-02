"use client";

import { useEffect, useRef, useState } from "react";

/* Hand-drawn margin marks — pencil/pen doodles scattered in the page gutters.
   Each mark draws itself in (stroke-dashoffset) the first time it scrolls into
   view, like someone marking up the sheet as you read it. Color comes from
   currentColor: pencil-grey via text-stone classes, pen via var(--m-pen). */

const DOODLES: Record<
  string,
  { viewBox: string; strokeWidth: number; stretch?: boolean; paths: string[] }
> = {
  ellipse: {
    viewBox: "0 0 100 44",
    strokeWidth: 1.6,
    stretch: true,
    paths: [
      "M50 4 C 22 3, 5 12, 5 22 C 5 33, 25 41, 52 40.5 C 79 40, 95 32, 95 21 C 95 11, 80 4.5, 58 4.2",
    ],
  },
};

export function InkDoodle({
  kind,
  className = "",
  delay = 0,
}: {
  kind: keyof typeof DOODLES;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const doodle = DOODLES[kind];
  return (
    <svg
      ref={ref}
      viewBox={doodle.viewBox}
      fill="none"
      aria-hidden
      preserveAspectRatio={doodle.stretch ? "none" : undefined}
      className={className}
    >
      {doodle.paths.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={doodle.strokeWidth}
          strokeLinecap="round"
          vectorEffect={doodle.stretch ? "non-scaling-stroke" : undefined}
          className={`[stroke-dasharray:1] transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none ${
            inView ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1] motion-reduce:[stroke-dashoffset:0]"
          }`}
          style={{ transitionDelay: `${delay + i * 130}ms` }}
        />
      ))}
    </svg>
  );
}
