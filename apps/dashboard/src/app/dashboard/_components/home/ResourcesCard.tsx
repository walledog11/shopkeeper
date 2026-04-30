"use client"

import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"
import { Card } from "@/components/ui/card"
import { tips } from "../help/content/tips"
import { TAG_COLORS, DEFAULT_TAG_COLOR } from "@/lib/articleTags"

const PREVIEW_ARTICLES = tips.articles.slice(0, 6)

export default function ResourcesCard() {
  return (
    <Card className="bg-card border-border rounded-md overflow-hidden noise-texture">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-white/30" />
          <h2 className="text-sm font-semibold text-white/70">Articles</h2>
        </div>
        <Link
          href="/dashboard/learn"
          className="flex items-center gap-1 text-xs font-medium text-white/30 hover:text-white/60 transition-colors"
        >
          View all {tips.articles.length} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {PREVIEW_ARTICLES.map((article) => {
          const tag = article.tag ?? "Tips"
          const tagColor = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR
          return (
            <Link
              key={article.id}
              href={`/dashboard/learn/${article.id}`}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
            >
              <p className="flex-1 text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">
                {article.title}
              </p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${tagColor}`}>
                {tag}
              </span>
              <ArrowRight className="w-3 h-3 text-white/20 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
