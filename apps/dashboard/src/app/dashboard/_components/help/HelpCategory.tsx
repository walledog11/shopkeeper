"use client"

import { ChevronRight } from "lucide-react"
import type { Category, Article } from "./content/index"

interface Props {
  category: Category
  onSelectArticle: (article: Article) => void
}

export default function HelpCategory({ category, onSelectArticle }: Props) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{category.icon}</span>
        <h2 className="text-base font-bold text-foreground">{category.title}</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">{category.description}</p>

      <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
        {category.articles.map(article => (
          <button type="button"
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors text-left group"
          >
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
              {article.title}
            </span>
            <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 ml-3 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  )
}
