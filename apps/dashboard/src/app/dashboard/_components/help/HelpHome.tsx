"use client"

import type { Category } from "./content/index"

interface Props {
  categories: Category[]
  onSelectCategory: (category: Category) => void
}

export default function HelpHome({ categories, onSelectCategory }: Props) {
  return (
    <div className="p-5 space-y-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Topics</p>
      <div className="space-y-1.5">
        {categories.map(cat => (
          <button type="button"
            key={cat.id}
            onClick={() => onSelectCategory(cat)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-md border border-border hover:border-border/70 hover:bg-muted transition-all text-left group"
          >
            <span className="text-lg shrink-0">{cat.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-foreground transition-colors">
                {cat.title}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{cat.description}</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground/60 shrink-0">
              {cat.articles.length}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
