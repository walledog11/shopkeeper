import Link from "next/link"
import { Compass, Store } from "lucide-react"

export default function NotFound() {
  return (
    <div className="dashboard-shell m-grain relative flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background p-8 text-center font-sans">
      <Link
        href="/dashboard"
        aria-label="Shopkeeper"
        className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 text-[#2b2118] transition-colors hover:text-[#2b2118]/75"
      >
        <Store className="size-6" strokeWidth={1.75} />
        <span className="text-2xl font-bold leading-none [font-family:var(--m-caveat)]">shopkeeper</span>
      </Link>
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <Compass className="size-5 text-foreground/50" />
      </span>
      <div className="max-w-sm">
        <p className="mb-2 font-sans text-3xl font-semibold leading-none tracking-tight text-foreground/80">
          Page not found
        </p>
        <p className="text-sm text-foreground/45">
          We couldn&rsquo;t find what you were looking for. It may have moved or no longer exists.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-foreground/60 transition-colors hover:bg-accent hover:text-foreground/80"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  )
}
