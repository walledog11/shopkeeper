"use client"

export function TicketsErrorState() {
  return (
    <div className="flex size-full items-center justify-center bg-background">
      <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
    </div>
  )
}
