"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Check } from "lucide-react"
import { tips } from "../_components/help/content/tips"
import { TAG_COLORS, DEFAULT_TAG_COLOR } from "@/lib/articleTags"

const ALL_TAGS = ["All", ...Array.from(new Set(tips.articles.map(a => a.tag ?? "Tips")))]
const READ_ARTICLES_KEY = "clerk_read_articles"

export default function LearnPage() {
  const [activeTag, setActiveTag] = useState("All")
  const [readIds, setReadIds] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(READ_ARTICLES_KEY)
      if (stored) setReadIds(JSON.parse(stored))
    } catch {
      // localStorage unavailable
    }
  }, [])

  const filtered = activeTag === "All"
    ? tips.articles
    : tips.articles.filter(a => a.tag === activeTag)

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-2">Resources</p>
          <h1 className="text-2xl font-bold text-foreground">Tips & Strategies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Best practices for social commerce and customer support — written for teams like yours.
          </p>
        </div>

        {/* Tag filter */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {ALL_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                activeTag === tag
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:border-border/70 hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Article grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(article => {
            const tag = article.tag ?? "Tips"
            const tagColor = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR
            const isRead = readIds.includes(article.id)

            return (
              <Link
                key={article.id}
                href={`/dashboard/learn/${article.id}`}
                className="group bg-card rounded-xl border border-border hover:border-border/70 hover:shadow-md p-5 flex flex-col gap-3 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${tagColor}`}>
                    {tag}
                  </span>
                  <div className="flex items-center gap-2">
                    {isRead && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60">
                        <Check className="w-3 h-3" />
                        Read
                      </span>
                    )}
                    {article.readingTime && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {article.readingTime} min read
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className={`text-sm font-bold leading-snug group-hover:text-violet-400 transition-colors ${isRead ? 'text-foreground/60' : 'text-foreground'}`}>
                    {article.title}
                  </h2>
                  {article.summary && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                </div>

                <div className={`flex items-center gap-1 text-xs font-semibold mt-1 transition-colors ${isRead ? 'text-muted-foreground/50 group-hover:text-indigo-500' : 'text-indigo-500 group-hover:text-indigo-700'}`}>
                  {isRead ? 'Read again' : 'Read article'} <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
