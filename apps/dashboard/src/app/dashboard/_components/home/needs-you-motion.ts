export const SWIPE_DISTANCE = 90
export const SWIPE_VELOCITY = 420
export const FLY_OFF = 340
export const FLY_OFF_DURATION = 0.28
export type StackPeekConfig = {
  depth: { x: number; y: number; rotate: number; scale: number; opacity: number }
  origin: string
  marginTop: number
  marginBottom: number
}

// Back cards fan up and to the left, tilted (Orders/Review boards).
export const DEFAULT_STACK_PEEK: StackPeekConfig = {
  depth: { x: -8, y: -7, rotate: -1.8, scale: 0.015, opacity: 0.16 },
  origin: "top center",
  marginTop: 14,
  marginBottom: 0,
}

// Back cards peek straight down, centered, narrower, untilted (home deck).
export const STACKED_BELOW_PEEK: StackPeekConfig = {
  depth: { x: 0, y: 8, rotate: 0, scale: 0.05, opacity: 0 },
  origin: "bottom center",
  marginTop: 0,
  marginBottom: 18,
}

export function arcY(x: number) {
  return (x * x) / 650
}

export function arcRotate(x: number) {
  return x * 0.055
}
