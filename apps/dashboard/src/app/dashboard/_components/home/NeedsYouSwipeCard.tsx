"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type ReactNode } from "react"
import { animate, m, useMotionValue, useTransform } from "motion/react"
import {
  arcRotate,
  arcY,
  FLY_OFF,
  FLY_OFF_DURATION,
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
} from "./needs-you-motion"

export type SwipeCardHandle = {
  flyOff: (sign: -1 | 1) => Promise<boolean>
}

export const SwipeCard = forwardRef<SwipeCardHandle, {
  stackDragX: ReturnType<typeof useMotionValue<number>>
  draggable: boolean
  onCommitLeft: () => void
  onCommitRight: () => void
  children: ReactNode
}>(function SwipeCard({
  stackDragX,
  draggable,
  onCommitLeft,
  onCommitRight,
  children,
}, ref) {
  const dragX = useMotionValue(0)
  const dragY = useTransform(dragX, arcY)
  const dragRotate = useTransform(dragX, arcRotate)
  const opacity = useMotionValue(1)
  const isFlying = useRef(false)

  useEffect(() => {
    return dragX.on("change", value => {
      stackDragX.set(value)
    })
  }, [dragX, stackDragX])

  const flyOff = useCallback(async (sign: -1 | 1) => {
    if (isFlying.current) return false
    isFlying.current = true

    try {
      const targetX = sign * FLY_OFF
      await Promise.all([
        animate(dragX, targetX, { duration: FLY_OFF_DURATION, ease: [0.32, 0, 0.67, 0] }),
        animate(stackDragX, targetX, { duration: FLY_OFF_DURATION, ease: [0.32, 0, 0.67, 0] }),
        animate(opacity, 0, { duration: FLY_OFF_DURATION, ease: "easeIn" }),
      ])
      return true
    } finally {
      isFlying.current = false
    }
  }, [dragX, opacity, stackDragX])

  useImperativeHandle(ref, () => ({ flyOff }), [flyOff])

  return (
    <m.div
      drag={draggable ? "x" : false}
      style={{ x: dragX, y: dragY, rotate: dragRotate, opacity, transformOrigin: "50% 100%" }}
      dragSnapToOrigin={false}
      dragElastic={0.5}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (isFlying.current) return

        const swiped = Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_VELOCITY
        if (!swiped) {
          void Promise.all([
            animate(dragX, 0, { type: "spring", stiffness: 420, damping: 32 }),
            animate(stackDragX, 0, { type: "spring", stiffness: 420, damping: 32 }),
          ])
          return
        }

        const sign = info.offset.x < 0 ? -1 : 1
        void flyOff(sign).then(animated => {
          if (!animated) return
          if (sign < 0) onCommitLeft()
          else onCommitRight()
        })
      }}
      className="touch-pan-y cursor-grab active:cursor-grabbing"
    >
      {children}
    </m.div>
  )
})
