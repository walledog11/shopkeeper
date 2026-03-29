"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, ChevronRight } from "lucide-react"
import type { Article } from "../../_components/help/content/index"
import { TAG_COLORS_BORDERED, DEFAULT_TAG_COLOR_BORDERED } from "@/lib/articleTags"

interface Props {
  article: Article
  relatedArticles: Article[]
}

export default function ArticlePageClient({ article, relatedArticles }: Props) {
  const headings = article.body
    .filter(s => !!s.heading)
    .map(s => s.heading as string)

  const [activeHeading, setActiveHeading] = useState<string | null>(headings[0] ?? null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Track which heading is in view for TOC highlighting
  useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.getAttribute("data-heading") ?? null)
          }
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 }
    )

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings.length])

  const scrollTo = (heading: string) => {
    sectionRefs.current[heading]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const tag = article.tag ?? "Tips"
  const tagColor = TAG_COLORS_BORDERED[tag] ?? DEFAULT_TAG_COLOR_BORDERED

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
          <Link href="/dashboard/learn" className="hover:text-slate-700 transition-colors font-medium">
            Articles
          </Link>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className={`font-semibold px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${tagColor}`}>
            {tag}
          </span>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-slate-500 truncate">{article.title}</span>
        </nav>

        <div className="flex gap-10 items-start">

          {/* Article body */}
          <article className="flex-1 min-w-0">

            {/* Article header */}
            <header className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-3">
                {article.title}
              </h1>
              <div className="flex items-center gap-3">
                {article.readingTime && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    {article.readingTime} min read
                  </span>
                )}
                {article.summary && (
                  <>
                    <span className="text-slate-200">·</span>
                    <p className="text-xs text-slate-400 italic">{article.summary}</p>
                  </>
                )}
              </div>
            </header>

            {/* Divider */}
            <div className="h-px bg-slate-200 mb-8" />

            {/* Sections */}
            <div className="space-y-8">
              {article.body.map((section, i) => (
                <div
                  key={i}
                  ref={el => {
                    if (section.heading) sectionRefs.current[section.heading] = el
                  }}
                  data-heading={section.heading}
                  className="space-y-4"
                >
                  {section.heading && (
                    <h2 className="text-base font-bold text-slate-900 leading-snug">
                      {section.heading}
                    </h2>
                  )}

                  {section.text && (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {section.text}
                    </p>
                  )}

                  {section.steps && (
                    <ol className="space-y-3">
                      {section.steps.map((step, j) => (
                        <li key={j} className="flex gap-3.5 text-sm text-slate-600 leading-relaxed">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
                            {j + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {section.tips && (
                    <ul className="space-y-2.5">
                      {section.tips.map((tip, j) => (
                        <li key={j} className="flex gap-3 text-sm text-slate-600 leading-relaxed">
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-slate-400 mt-2" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.callout && (
                    <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3.5">
                      <span className="shrink-0 text-base mt-0.5">💡</span>
                      <p className="text-sm text-indigo-800 leading-relaxed">{section.callout}</p>
                    </div>
                  )}

                  {section.warning && (
                    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3.5">
                      <span className="shrink-0 text-base mt-0.5">⚠️</span>
                      <p className="text-sm text-amber-800 leading-relaxed">{section.warning}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Divider before related */}
            {relatedArticles.length > 0 && (
              <div className="mt-12 pt-8 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Related articles</p>
                <div className="space-y-2">
                  {relatedArticles.map(rel => (
                    <Link
                      key={rel.id}
                      href={`/dashboard/learn/${rel.id}`}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                          {rel.title}
                        </p>
                        {rel.readingTime && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                            <Clock className="w-3 h-3" /> {rel.readingTime} min read
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back link */}
            <div className="mt-8">
              <Link
                href="/dashboard/learn"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to all articles
              </Link>
            </div>
          </article>

          {/* Sticky TOC — desktop only, only if there are headings */}
          {headings.length > 1 && (
            <aside className="hidden lg:block w-52 shrink-0 sticky top-0">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  On this page
                </p>
                <nav className="space-y-1">
                  {headings.map(heading => (
                    <button
                      key={heading}
                      onClick={() => scrollTo(heading)}
                      className={`w-full text-left text-xs leading-snug px-2.5 py-1.5 rounded-md transition-all ${
                        activeHeading === heading
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      {heading}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
