"use client";

import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import { useEffect, useRef, useState } from "react";

type BentoLottieProps = {
  src: string;
  className?: string;
};

export function BentoLottie({ src, className }: BentoLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setAnimationData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !animationData) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          lottieRef.current?.goToAndPlay(0, true);
        } else {
          lottieRef.current?.pause();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animationData]);

  return (
    <div ref={containerRef} className={className} aria-hidden>
      {animationData ? (
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop
          autoplay={false}
          className="size-full"
          rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
        />
      ) : null}
    </div>
  );
}
