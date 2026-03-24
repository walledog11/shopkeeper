"use client"

import { useState } from "react"
import { X, ChevronLeft } from "lucide-react"
import { ALL_CATEGORIES, type Category, type Article } from "./content/index"
import HelpHome from "./HelpHome"
import HelpCategory from "./HelpCategory"
import HelpArticle from "./HelpArticle"

type View =
  | { type: "home" }
  | { type: "category"; category: Category }
  | { type: "article"; category: Category; article: Article }

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function HelpPanel({ isOpen, onClose }: Props) {
  const [view, setView] = useState<View>({ type: "home" })

  const handleClose = () => {
    setView({ type: "home" })
    onClose()
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
      className={`shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden transition-all duration-300 ease-in-out
        ${isOpen ? "fixed inset-0 z-50 w-full md:static md:w-72" : "w-0"}
      `}
    >
      {isOpen && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              {view.type !== "home" && (
                <button
                  onClick={goBack}
                  className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900 leading-none">Help</p>
                <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
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
                onSelectArticle={article => setView({ type: "article", category: view.category, article })}
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
