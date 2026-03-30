"use client"

import { ChevronRight } from "lucide-react"
import type { Category, Article } from "./content/index"

interface Props {
  category: Category
  onSelectArticle: (article: Article) => void
}

export default function HelpCategory({ category, onSelectArticle }: Props) {
  return (
    <div className="px-5 py-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{category.icon}</span>
        <h2 className="text-base font-bold text-slate-900">{category.title}</h2>
      </div>
      <p className="text-sm text-slate-500 -mt-2">{category.description}</p>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
        {category.articles.map(article => (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors text-left group"
          >
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors leading-snug">
              {article.title}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 ml-3 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}
