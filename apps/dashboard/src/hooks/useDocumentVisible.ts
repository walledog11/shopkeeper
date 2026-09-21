import { useEffect, useState } from "react"

export function useDocumentVisible() {
  const [isVisible, setIsVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  )

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [])

  return isVisible
}
