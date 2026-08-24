import { Pulse } from "./Pulse"
import { SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"

export function AccountSettingsSkeleton({
  profileOnly = false,
}: {
  profileOnly?: boolean
}) {
  const tileCount = profileOnly ? 3 : 7

  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: tileCount }, (_, index) => (
        <div key={index} className={cn(SOLID_SETTINGS_TILE, "space-y-2")}>
          <Pulse className="h-4 w-28 rounded-md" />
          <Pulse className="h-4 w-2/3 rounded-md bg-foreground/[0.05]" />
        </div>
      ))}
      {profileOnly ? null : <Pulse className="h-12 w-full rounded-2xl" />}
    </div>
  )
}
