import Image from "next/image"
import { Package } from "lucide-react"

export function ProductImage({ src, title }: { src: string | null; title: string }) {
  if (!src) {
    return (
      <div className="size-9 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
        <Package className="size-4 text-white/20" />
      </div>
    )
  }
  return (
    <Image
      src={src}
      alt={title}
      width={36}
      height={36}
      unoptimized
      className="size-9 rounded-md object-cover border border-white/[0.08] shrink-0"
    />
  )
}
