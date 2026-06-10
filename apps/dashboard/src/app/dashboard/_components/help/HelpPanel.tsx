"use client"

import { useState } from "react"
import { X, ChevronLeft } from "lucide-react"
import { ALL_CATEGORIES, type Category, type Article } from "./content/index"
import HelpHome from "./HelpHome"
import HelpCategory from "./HelpCategory"
import HelpArticle from "./HelpArticle"
import { useHelp } from "./HelpContext"

type View =
  | { type: "home" }
  | { type: "category"; category: Category }
  | { type: "article"; category: Category; article: Article }

export default function HelpPanel() {
  const { isOpen, closeHelp } = useHelp()
  const [view, setView] = useState<View>({ type: "home" })

  function handleSelectArticle(category: Category, article: Article) {
    setView({ type: "article", category, article })
  }

  const handleClose = () => {
    setView({ type: "home" })
    closeHelp()
  }

  const goBack = () => {
    if (view.type === "article") setView({ type: "category", category: view.category })
    else if (view.type === "category") setView({ type: "home" })
  }

  const subtitle =
    view.type === "home" ? "Home"
    : view.type === "category" ? view.category.title
    : view.article.title

  return (
    <div
      className={`shrink-0 border-l border-border bg-background flex flex-col overflow-hidden transition-all duration-300 ease-in-out
        ${isOpen ? "fixed inset-0 z-50 w-full md:static md:w-72" : "w-0"}
      `}
    >
      {isOpen && (
        <>
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
            <button type="button"
              onClick={handleClose}
              className="size-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors shrink-0 mt-0.5"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {view.type === "home" && (
              <HelpHome
                categories={ALL_CATEGORIES}
                onSelectCategory={cat => setView({ type: "category", category: cat })}
              />
            )}
            {view.type === "category" && (
              <HelpCategory
                category={view.category}
                onSelectArticle={article => handleSelectArticle(view.category, article)}
              />
            )}
            {view.type === "article" && (
              <HelpArticle article={view.article} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
