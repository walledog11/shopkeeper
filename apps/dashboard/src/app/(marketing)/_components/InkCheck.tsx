/** A small hand-scribbled ink checkmark — two quick pen strokes, no chrome.
 *  Inherits color via currentColor so it reads as ink on light cards and cream
 *  on the dark Pro card. */
export function InkCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M4 12.5 C 5.5 13.5, 7.6 15.4, 9 19.5 C 11.4 13, 15.6 7.6, 21 4.4"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
