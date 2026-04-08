import { useState, useEffect } from 'react'

export function useFillerPhrase(phrases: string[], active: boolean, intervalMs = 2500): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const id = setInterval(() => {
      setIndex(i => (i + 1) % phrases.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [active, phrases.length, intervalMs])

  return phrases[index]
}
