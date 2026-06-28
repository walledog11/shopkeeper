"use client"

import { useEffect, useReducer, useRef, type RefObject } from "react"
import type { ChatMessage } from "./shared"

type ChatAnimationState = {
  count: number | null
  typing: boolean
}

type ChatAnimationAction =
  | { type: "start" }
  | { type: "showAll"; total: number }
  | { type: "showTyping" }
  | { type: "advance"; total: number }

function reducer(state: ChatAnimationState, action: ChatAnimationAction): ChatAnimationState {
  switch (action.type) {
    case "start":
      return state.count === null ? { count: 0, typing: false } : state
    case "showAll":
      return { count: action.total, typing: false }
    case "showTyping":
      return state.count === null ? state : { ...state, typing: true }
    case "advance":
      return state.count === null
        ? state
        : { count: Math.min(state.count + 1, action.total), typing: false }
  }
}

export function useChatDemoAnimation(
  messages: ChatMessage[],
  frameRef: RefObject<HTMLDivElement | null>,
) {
  const messageCountRef = useRef(messages.length)
  messageCountRef.current = messages.length
  const [animation, dispatch] = useReducer(reducer, { count: null, typing: false })
  const count = animation.count ?? 0

  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dispatch({ type: "showAll", total: messageCountRef.current })
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      dispatch({ type: "start" })
      observer.disconnect()
    }, { threshold: 0.45 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [frameRef])

  useEffect(() => {
    if (animation.count === null || count >= messages.length) return
    const next = messages[count]
    const timers: ReturnType<typeof setTimeout>[] = []
    if (next.from === "agent") {
      timers.push(setTimeout(() => dispatch({ type: "showTyping" }), 400))
      timers.push(setTimeout(() => dispatch({ type: "advance", total: messages.length }), 1600))
    } else {
      timers.push(setTimeout(() => dispatch({ type: "advance", total: messages.length }), 1000))
    }
    return () => timers.forEach(clearTimeout)
  }, [animation.count, count, messages])

  return { count, typing: animation.typing }
}
