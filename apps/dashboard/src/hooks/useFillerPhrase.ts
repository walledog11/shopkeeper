import { useState, useEffect } from 'react'

export function useFillerPhrase(phrases: string[], active: boolean, intervalMs = 2500): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % phrases.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [active, phrases.length, intervalMs])

  return active ? phrases[index] : phrases[0]
}
