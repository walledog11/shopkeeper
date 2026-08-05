import { cn } from "@/lib/ui/cn"
import { PULSE } from "./styles"

export function Pulse({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn(PULSE, className)} {...props} />
}
