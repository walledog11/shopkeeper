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
  asterisk: {
    viewBox: "0 0 24 24",
    strokeWidth: 1.7,
    paths: [
      "M12 3.2 C 11.4 8.8, 12.6 14.6, 11.9 20.8",
      "M4.2 7.4 C 9.2 10.4, 14.6 13.8, 19.8 16.9",
      "M19.6 7.1 C 14.4 10.2, 9.4 13.6, 4.4 16.8",
    ],
  },
  bangbang: {
    viewBox: "0 0 20 26",
    strokeWidth: 1.9,
    paths: [
      "M6.2 3.4 C 5.8 7.8, 6.6 11.4, 6.2 15.2",
      "M5.9 20.6 C 6.1 20.9, 6.4 21.1, 6.2 21.4",
      "M13.8 2.8 C 13.4 7.2, 14.2 10.9, 13.8 14.7",
      "M13.5 20.1 C 13.7 20.4, 14 20.6, 13.8 20.9",
    ],
  },
  arrow: {
    viewBox: "0 0 72 56",
    strokeWidth: 1.7,
    paths: [
      "M5 7 C 26 10, 47 22, 61 44",
      "M61 44 C 57.4 42.4, 53.8 41.4, 50.2 40.9",
      "M61 44 C 60 39.4, 59.5 35.3, 59.8 31.2",
    ],
  },
  tally: {
    viewBox: "0 0 34 26",
    strokeWidth: 1.7,
    paths: [
      "M5 4 C 5.4 10, 4.7 16, 5.2 22",
      "M12 3.6 C 11.6 9.8, 12.3 16.2, 11.8 22.4",
      "M19 4.2 C 19.4 10.2, 18.7 15.8, 19.2 21.8",
      "M26 3.8 C 25.6 9.9, 26.4 16, 25.9 22.1",
      "M1 20 C 9 15, 19 9, 32 3.5",
    ],
  },
  scribble: {
    viewBox: "0 0 60 10",
    strokeWidth: 1.4,
    stretch: true,
    paths: [
      "M2 5.2 C 12 3.2, 24 7.4, 34 4.6 C 44 2.2, 52 6.8, 58 4.4 C 50 6.6, 40 3.4, 30 5.8 C 20 8, 10 4, 3 6.4",
    ],
  },
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
