import { formatRelativeTime } from "@/lib/format/date"

/**
 * "13 min ago" for a timestamp. The server and the browser each work it out
 * from their own clock and time zone, so the two renders can differ by a
 * minute, or by a day near midnight; the element accepts the server's text at
 * hydration instead of failing it, and the next render brings it up to date.
 */
export function RelativeTime({ at, className }: { at: string; className?: string }) {
  return (
    <time dateTime={at} className={className} suppressHydrationWarning>
      {formatRelativeTime(at)}
    </time>
  )
}
