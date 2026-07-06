import { Reveal } from "./Reveal";

/* Pressed wax seal with the shop-awning mark — turbulence displacement gives
   the blob its squeezed-out irregular edge; the emblem is debossed with a
   light ghost copy offset under the dark strokes. */
function WaxSeal({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className}>
      <defs>
        <radialGradient id="wax-body" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#a63b2c" />
          <stop offset="46%" stopColor="#8c2b20" />
          <stop offset="82%" stopColor="#701f17" />
          <stop offset="100%" stopColor="#5e1a13" />
        </radialGradient>
        <radialGradient id="wax-disc" cx="44%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#98352a" />
          <stop offset="70%" stopColor="#7c241c" />
          <stop offset="100%" stopColor="#671d15" />
        </radialGradient>
        <filter id="wax-rough" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="14" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" />
        </filter>
        <filter id="wax-press" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" />
        </filter>
      </defs>
      <g filter="url(#wax-rough)">
        <circle cx="60" cy="60" r="48" fill="url(#wax-body)" />
        <circle cx="22" cy="52" r="12" fill="url(#wax-body)" />
        <circle cx="98" cy="66" r="10" fill="url(#wax-body)" />
        <circle cx="72" cy="14" r="9" fill="url(#wax-body)" />
        <circle cx="42" cy="104" r="8" fill="url(#wax-body)" />
        <circle cx="60" cy="60" r="36" fill="url(#wax-disc)" />
        <path d="M28 70 A34 34 0 0 1 50 27" stroke="rgba(52,10,6,0.55)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M92 52 A34 34 0 0 1 68 92" stroke="rgba(214,120,100,0.4)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M22 44 A44 44 0 0 1 52 14" stroke="rgba(222,130,110,0.45)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>
      {/* Shop-awning mark, matching the Store logo: tent awning with scalloped
          hem, body, centered door. Ghost copy offset below-right = deboss. */}
      <g filter="url(#wax-press)">
        {[
          { stroke: "rgba(224,140,120,0.35)", transform: "translate(38.3 39.7) scale(1.9)" },
          { stroke: "#4a120c", transform: "translate(37.2 38.3) scale(1.9)" },
        ].map(({ stroke, transform }) => (
          <g
            key={stroke}
            stroke={stroke}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={transform}
          >
            <path d="M2 7 L6.41 2.59 A2 2 0 0 1 7.83 2 H16.17 A2 2 0 0 1 17.59 2.59 L22 7 V9.6 a2.5 2.5 0 0 1 -5 0 a2.5 2.5 0 0 1 -5 0 a2.5 2.5 0 0 1 -5 0 a2.5 2.5 0 0 1 -5 0 Z" />
            <path d="M4.6 12.6 V19 a2 2 0 0 0 2 2 h10.8 a2 2 0 0 0 2 -2 V12.6" />
            <path d="M10 21 v-3 q0 -1.5 1.5 -1.5 h1 q1.5 0 1.5 1.5 v3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function CTA() {
  return (
    <div className="px-6 pb-20 pt-6">
      <Reveal className="mx-auto max-w-5xl">
        {/* drop-shadow (not box-shadow) so the depth follows the torn silhouette */}
        <div className="m-torn-paper relative bg-[length:100%_100%] px-8 py-20 text-center [filter:drop-shadow(0_2px_4px_rgba(43,33,24,0.14))_drop-shadow(0_28px_44px_rgba(43,33,24,0.32))] sm:flex sm:aspect-[3842/2724] sm:flex-col sm:items-center sm:justify-center sm:bg-contain sm:py-0">
          <WaxSeal className="pointer-events-none absolute bottom-[14%] right-[11%] hidden w-[140px] -rotate-[9deg] [filter:drop-shadow(0_6px_11px_rgba(60,15,10,0.32))] sm:block" />
          <h2 className="mx-auto mb-3 max-w-[15ch] -rotate-[2deg] text-[clamp(56px,9vw,116px)] font-normal leading-[0.9] text-stone-900 [font-family:var(--m-hand)]">
            Your next hire doesn&apos;t need a desk.
          </h2>
          <p className="mx-auto mb-8 max-w-[46ch] text-[clamp(22px,3vw,32px)] leading-[1.05] text-stone-600 [font-family:var(--m-hand)]">
            Set up in five minutes. Your customers will never know you slept.
          </p>
          <a
            href="/signup"
            className="inline-flex rounded-full bg-white px-8 py-3 text-[clamp(22px,2.6vw,28px)] leading-none text-stone-900 shadow-[0_10px_24px_-10px_rgba(43,33,24,0.4)] transition-transform duration-200 hover:-translate-y-0.5 [font-family:var(--m-hand)]"
          >
            Hire Shopkeeper — start free
          </a>
        </div>
      </Reveal>
    </div>
  );
}
