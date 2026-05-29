import type { ReactNode } from "react"

export function CustomerDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
      <button type="button" aria-label="Close customer drawer" className="absolute inset-0 border-0 bg-neutral-950/50 p-0 sm:bg-neutral-950/30" onClick={onClose} />

      <div
        className={`
          absolute bg-background border-border flex flex-col overflow-hidden
          transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl border-t
          sm:bottom-auto sm:top-0 sm:right-0 sm:left-auto sm:h-full sm:w-96 sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l
          ${isOpen
            ? "translate-y-0 sm:translate-x-0 opacity-100 scale-100"
            : "translate-y-full sm:translate-y-0 sm:translate-x-[calc(100%+1px)] opacity-0 sm:opacity-100 scale-[0.98] sm:scale-100"
          }
        `}
      >
        {children}
      </div>
    </div>
  )
}
