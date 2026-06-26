import Image from "next/image"
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
  imageSrc?: string
}

export default function AgentAvatar({ agentName, size = "md", className, imageSrc }: Props) {
  const initial = agentName.charAt(0).toUpperCase()

  return (
    <div
      aria-hidden
      className={cn(
        "rounded-full flex items-center justify-center font-display-serif leading-none shrink-0 select-none",
        imageSrc ? "overflow-hidden bg-white text-transparent" : "bg-primary text-primary-foreground",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          width={40}
          height={40}
          className="size-full rounded-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  )
}
