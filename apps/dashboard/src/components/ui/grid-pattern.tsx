import * as React from "react"

import { cn } from "@/lib/ui/cn"

interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number
  height?: number
  x?: number
  y?: number
  squares?: Array<[number, number]>
  strokeDasharray?: string
}

export function GridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  squares,
  strokeDasharray = "0",
  className,
  ...props
}: GridPatternProps) {
  const id = React.useId()

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full fill-white/5 stroke-white/10",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      {squares?.map(([squareX, squareY]) => (
        <rect
          key={`${squareX}-${squareY}`}
          width={width - 1}
          height={height - 1}
          x={squareX * width + 1}
          y={squareY * height + 1}
          strokeWidth="0"
        />
      ))}
    </svg>
  )
}
