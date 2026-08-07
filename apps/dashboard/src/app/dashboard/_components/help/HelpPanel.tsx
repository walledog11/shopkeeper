"use client"

import { useEffect, useState } from "react"
import { X, ChevronLeft } from "lucide-react"
import { ALL_CATEGORIES, withAgentName, type Category, type Article } from "./content/index"
import HelpHome from "./HelpHome"
import HelpCategory from "./HelpCategory"
import HelpArticle from "./HelpArticle"
import { useHelp } from "./HelpContext"

type View =
  | { type: "home" }
  | { type: "category"; category: Category }
  | { type: "article"; category: Category; article: Article }

export default function HelpPanel({ agentName }: { agentName: string }) {
  const { isOpen, closeHelp } = useHelp()
  const [view, setView] = useState<View>({ type: "home" })

  function handleSelectArticle(category: Category, article: Article) {
    setView({ type: "article", category, article })
  }

  // Reset on open, not on close — resetting on close would snap the panel back
  // to Home mid-collapse.
  useEffect(() => {
    if (isOpen) setView({ type: "home" })
  }, [isOpen])

  const goBack = () => {
    if (view.type === "article") setView({ type: "category", category: view.category })
    else if (view.type === "category") setView({ type: "home" })
  }

  const subtitle =
    view.type === "home" ? "Home"
    : view.type === "category" ? withAgentName(view.category.title, agentName)
    : withAgentName(view.article.title, agentName)

  return (
    <div
      className={`fixed inset-0 z-50 w-full border-border bg-background flex flex-col overflow-hidden transition-transform duration-300 ease-in-out
        md:static md:inset-auto md:z-auto md:shrink-0 md:translate-x-0 md:transition-[width]
        ${isOpen ? "translate-x-0 md:w-[331px] md:border-l" : "translate-x-full md:w-0"}
      `}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      {/* Fixed-width so the contents lay out identically at every frame of the
          width transition — otherwise the text reflows as the panel grows. */}
      <div className="flex h-full w-screen flex-col overflow-hidden md:w-[331px]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            {view.type !== "home" && (
              <button type="button"
                onClick={goBack}
                className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-base font-bold text-foreground leading-none">Help</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
            </div>
          </div>
          {/* Desktop closes from the top-bar button, which becomes an X while
              the panel is open; on mobile that bar is behind the overlay. */}
          <button type="button"
            onClick={closeHelp}
            aria-label="Close help"
            className="md:hidden size-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors shrink-0 mt-0.5"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {view.type === "home" && (
            <HelpHome
              categories={ALL_CATEGORIES}
              agentName={agentName}
              onSelectCategory={cat => setView({ type: "category", category: cat })}
            />
          )}
          {view.type === "category" && (
            <HelpCategory
              category={view.category}
              agentName={agentName}
              onSelectArticle={article => handleSelectArticle(view.category, article)}
            />
          )}
          {view.type === "article" && (
            <HelpArticle article={view.article} agentName={agentName} />
          )}
        </div>
      </div>
    </div>
  )
}
