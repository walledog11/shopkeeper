"use client"

import { useCallback, useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react"
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

interface SwipeCardProps {
  stackDragX: ReturnType<typeof useMotionValue<number>>
  draggable: boolean
  onCommitLeft: () => void
  onCommitRight: () => void
  children: ReactNode
  ref?: Ref<SwipeCardHandle>
}

export function SwipeCard({
  stackDragX,
  draggable,
  onCommitLeft,
  onCommitRight,
  children,
  ref,
}: SwipeCardProps) {
  const dragX = useMotionValue(0)
  const dragY = useTransform(dragX, arcY)
  const dragRotate = useTransform(dragX, arcRotate)
  const opacity = useMotionValue(1)
  const isFlying = useRef(false)

  const highlightPosition = useTransform(
    dragX,
    [-200, 0, 200],
    ["100% 50%", "50% 50%", "0% 50%"],
  )
  const highlightOpacity = useTransform(
    dragX,
    [-SWIPE_DISTANCE, 0, SWIPE_DISTANCE],
    [0.35, 0, 0.35],
  )

  useEffect(() => {
    const unsubscribe = dragX.on("change", value => {
      stackDragX.set(value)
    })
    return () => unsubscribe()
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
      className="relative touch-pan-y cursor-grab active:cursor-grabbing"
    >
      {draggable && (
        <m.div
          aria-hidden
          style={{ opacity: highlightOpacity }}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-3xl"
        >
          <m.div
            style={{
              backgroundPosition: highlightPosition,
              backgroundImage:
                "radial-gradient(circle at center, rgba(255,255,255,0.14) 0%, transparent 55%)",
              backgroundSize: "140% 140%",
            }}
            className="absolute inset-0"
          />
        </m.div>
      )}

      <div className="relative z-0">{children}</div>
    </m.div>
  )
}
