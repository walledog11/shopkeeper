import { useState, useCallback } from 'react'

export function useTicketSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const handleClearSelection = useCallback(() => setSelectedIds([]), [])

  return { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection }
}
