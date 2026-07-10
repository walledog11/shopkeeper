"use client"

import Image from "next/image"
import { Mail } from "lucide-react"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import { cn } from "@/lib/ui/cn"
import { CARD_TITLE, LOGO_IMAGE, LOGO_INLINE } from "./integration-card-styles"

const INLINE_LOGO_SIZE = 32

const FALLBACK_ICONS: Record<string, typeof Mail> = {
  email: Mail,
}

export function CardLogo({ config }: { config: PlatformConfig }) {
  const Icon = FALLBACK_ICONS[config.id]

  if (!config.logo) {
    if (!Icon) return null
    return (
      <Icon
        className={cn(
          LOGO_INLINE,
          "text-card-foreground opacity-[0.88] transition-opacity duration-200 group-hover:opacity-100",
        )}
      />
    )
  }

  return (
    <Image
      src={config.logo}
      alt={`${config.name} logo`}
      width={INLINE_LOGO_SIZE}
      height={INLINE_LOGO_SIZE}
      className={LOGO_IMAGE}
    />
  )
}

export function IntegrationCardHeader({ config }: { config: PlatformConfig }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <CardLogo config={config} />
      <p className={cn("min-w-0", CARD_TITLE)}>{config.name}</p>
    </div>
  )
}
