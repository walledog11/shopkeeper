import { cn } from "@/lib/ui/cn"

const TONE_CLASSES = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
} as const

export function Switch({
  checked,
  onChange,
  disabled,
  tone = "green",
  ariaLabel,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  tone?: keyof typeof TONE_CLASSES
  ariaLabel?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? TONE_CLASSES[tone] : "bg-foreground/[0.15]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  )
}
