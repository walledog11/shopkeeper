"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { tips } from "../help/content/tips"
import { TAG_COLORS, DEFAULT_TAG_COLOR } from "@/lib/articleTags"

const PREVIEW_ARTICLES = tips.articles.slice(0, 3)

export default function ResourcesCard() {
  return (
    <div className="h-full bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-center px-4 py-2 border-b border-slate-100 shrink-0">
        <h2 className="text-sm font-semibold text-slate-900">Articles</h2>
      </div>

      <div className="flex-1 divide-y divide-slate-50 overflow-y-auto">
        {PREVIEW_ARTICLES.map(article => {
          const tag = article.tag ?? "Tips"
          const tagColor = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR
          return (
            <Link
              key={article.id}
              href={`/dashboard/learn/${article.id}`}
              className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                  {article.title}
                </p>
                <span className={`inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tagColor}`}>
                  {tag}
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
            </Link>
          )
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 shrink-0">
        <Link
          href="/dashboard/learn"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-900 transition-colors"
        >
          View all {tips.articles.length} articles <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}
