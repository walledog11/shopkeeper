export const SWIPE_DISTANCE = 90
export const SWIPE_VELOCITY = 420
export const FLY_OFF = 340
export const FLY_OFF_DURATION = 0.28
export const STACK_DEPTH = { x: 8, y: 7, rotate: 1.8, scale: 0.015, opacity: 0.16 } as const
export const STACK_MARGIN_TOP = STACK_DEPTH.y * 2

export function arcY(x: number) {
  return (x * x) / 650
}

export function arcRotate(x: number) {
  return x * 0.055
}
