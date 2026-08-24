import { Pulse } from "./Pulse"

export function AccountSettingsSkeleton({
  profileOnly = false,
}: {
  profileOnly?: boolean
}) {
  return (
    <div className={profileOnly ? undefined : "space-y-6"}>
      <div className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="space-y-4">
          <Pulse className="h-5 w-28 rounded-md" />
          <Pulse className="h-20 w-full rounded-lg" />
          <Pulse className="h-20 w-full rounded-lg" />
          <Pulse className="h-20 w-full rounded-lg" />
        </div>
      </div>
      {profileOnly ? null : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="space-y-4">
              <Pulse className="h-5 w-28 rounded-md" />
              <Pulse className="h-20 w-full rounded-lg" />
              <Pulse className="h-20 w-full rounded-lg" />
            </div>
          </div>
          <Pulse className="h-12 w-full rounded-2xl" />
        </>
      )}
    </div>
  )
}
