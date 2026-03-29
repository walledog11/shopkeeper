"use client"

import type { Category } from "./content/index"

interface Props {
  categories: Category[]
  onSelectCategory: (category: Category) => void
}

export default function HelpHome({ categories, onSelectCategory }: Props) {
  return (
    <div className="px-5 py-5 space-y-3">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Topics</p>
      <div className="space-y-1.5">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group"
          >
            <span className="text-lg shrink-0">{cat.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900 transition-colors">
                {cat.title}
              </p>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{cat.description}</p>
            </div>
            <span className="text-[10px] font-semibold text-slate-300 shrink-0">
              {cat.articles.length}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
