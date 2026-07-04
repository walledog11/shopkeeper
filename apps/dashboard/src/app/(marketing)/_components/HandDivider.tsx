/** A short, faint, hand-ruled pen line marking a section break — a quieter,
 *  warmer stand-in for a full-width hairline rule. */
export function HandDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex justify-center text-stone-900/20 ${className}`}>
      <svg width="104" height="8" viewBox="0 0 104 8" fill="none">
        <path
          d="M2 5 C 26 2.4, 46 6.6, 66 4 C 82 2, 94 5.2, 102 3.4"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
