"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock } from "lucide-react"
import { tips } from "../_components/help/content/tips"
import { TAG_COLORS_BORDERED, DEFAULT_TAG_COLOR_BORDERED } from "@/lib/articleTags"

const ALL_TAGS = ["All", ...Array.from(new Set(tips.articles.map(a => a.tag ?? "Tips")))]

export default function LearnPage() {
  const [activeTag, setActiveTag] = useState("All")

  const filtered = activeTag === "All"
    ? tips.articles
    : tips.articles.filter(a => a.tag === activeTag)

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-2">Resources</p>
          <h1 className="text-2xl font-bold text-slate-900">Tips & Strategies</h1>
          <p className="text-sm text-slate-500 mt-1">
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
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-800"
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
            const tagColor = TAG_COLORS_BORDERED[tag] ?? DEFAULT_TAG_COLOR_BORDERED

            return (
              <Link
                key={article.id}
                href={`/dashboard/learn/${article.id}`}
                className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md p-5 flex flex-col gap-3 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${tagColor}`}>
                    {tag}
                  </span>
                  {article.readingTime && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      {article.readingTime} min read
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h2 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
                    {article.title}
                  </h2>
                  {article.summary && (
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs font-semibold text-indigo-500 group-hover:text-indigo-700 transition-colors mt-1">
                  Read article <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
