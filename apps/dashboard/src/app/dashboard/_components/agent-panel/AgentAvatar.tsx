import { cn } from "@/lib/ui/cn"

const SIZE_CLASSES = {
  sm: "size-6 text-[11px]",
  md: "size-7 text-xs",
  lg: "size-9 text-lg",
  xl: "size-10 text-xl",
} as const

interface Props {
  agentName: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

export default function AgentAvatar({ agentName, size = "md", className }: Props) {
  const initial = agentName.charAt(0).toUpperCase()

  return (
    <div
      aria-hidden
      className={cn(
        "rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display-serif leading-none shrink-0 select-none",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initial}
    </div>
  )
}
