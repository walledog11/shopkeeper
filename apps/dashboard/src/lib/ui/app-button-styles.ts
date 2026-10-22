import { cn } from "@/lib/ui/cn"

/** Primary actions in settings, agent configure, and home cards — marketing ink, pill shape. */
export const appPrimaryButtonClassName = cn(
  "inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
  "hover:bg-black sm:w-auto",
)

/** Clerk element overrides need important flags on colors. */
export const clerkPrimaryButtonClassName = cn(
  appPrimaryButtonClassName,
  "!bg-primary !text-primary-foreground hover:!bg-black",
)
