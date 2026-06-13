"use client"

import Image from "next/image"
import { BadgeCheck, Mail } from "lucide-react"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import { cn } from "@/lib/ui/cn"
import { LOGO_IMAGE, LOGO_SOFTEN, LOGO_TILE } from "./integration-card-styles"

const FALLBACK_ICONS: Record<string, typeof Mail> = {
  email: Mail,
}

export function CardLogo({ config }: { config: PlatformConfig }) {
  const Icon = FALLBACK_ICONS[config.id]
  const tileClass = cn(LOGO_TILE, config.tileClass)

  if (!config.logo) {
    return (
      <div className={tileClass}>
        {Icon ? (
          <Icon className="size-7 text-card-foreground opacity-[0.88] transition-opacity duration-200 group-hover:opacity-100" />
        ) : null}
      </div>
    )
  }

  if (config.fullBleedLogo) {
    const image = (
      <Image
        src={config.logo}
        alt={`${config.name} logo`}
        width={56}
        height={56}
        className={cn(
          "size-full",
          config.tileClass ? "object-cover" : "object-contain",
          LOGO_SOFTEN,
        )}
      />
    )
    return <div className={cn(tileClass, config.tileClass && "p-0")}>{image}</div>
  }

  const logoSize = config.logoSize ?? 40
  return (
    <div className={tileClass}>
      <Image
        src={config.logo}
        alt={`${config.name} logo`}
        width={logoSize}
        height={logoSize}
        className={LOGO_IMAGE}
      />
    </div>
  )
}

export function ShopkeeperBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 self-start">
      <Image src="/logos/shopkeeper-shop-logo.png" alt="" width={20} height={20} className="rounded-[6px]" />
      <span className="text-[13px] font-semibold leading-none text-card-foreground">shopkeeper</span>
      <BadgeCheck aria-label="Verified" className="size-3.5 fill-[#1D9BF0] text-card-foreground" />
    </span>
  )
}
