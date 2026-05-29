import { cn } from "@/lib/ui/cn"

export function GreenToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Disable permission" : "Enable permission"}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none",
        checked ? "bg-emerald-500" : "bg-white/[0.10]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  )
}
