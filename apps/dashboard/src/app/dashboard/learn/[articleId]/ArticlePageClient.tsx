"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, ChevronRight } from "lucide-react"
import type { Article } from "../../_components/help/content/index"
import { TAG_COLORS, DEFAULT_TAG_COLOR } from "@/app/dashboard/_lib/article-tags"

const READ_ARTICLES_KEY = "clerk_read_articles"

interface Props {
  article: Article
  relatedArticles: Article[]
}

function markArticleRead(articleId: string) {
  try {
    const stored = localStorage.getItem(READ_ARTICLES_KEY)
    const ids: string[] = stored ? JSON.parse(stored) : []
    if (!ids.includes(articleId)) {
      localStorage.setItem(READ_ARTICLES_KEY, JSON.stringify([...ids, articleId]))
    }
  } catch {
    // localStorage unavailable, skip silently
  }
}

export default function ArticlePageClient({ article, relatedArticles }: Props) {
  const headings = article.body.flatMap(s => s.heading ? [s.heading] : [])

  const [activeHeading, setActiveHeading] = useState<string | null>(headings[0] ?? null)
  const articleIdRef = useRef(article.id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Persist read state to localStorage on mount
  useEffect(() => {
    markArticleRead(articleIdRef.current)
  }, [])

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
  const tagColor = TAG_COLORS[tag] ?? DEFAULT_TAG_COLOR

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link href="/dashboard/learn" className="hover:text-foreground transition-colors font-medium">
            Articles
          </Link>
          <ChevronRight className="size-3 shrink-0" />
          <span className={`font-semibold px-1.5 py-0.5 rounded-full border text-xs uppercase tracking-wide ${tagColor}`}>
            {tag}
          </span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="text-foreground/60 truncate">{article.title}</span>
        </nav>

        <div className="flex gap-10 items-start">

          {/* Article body */}
          <article className="flex-1 min-w-0">

            {/* Article header */}
            <header className="mb-8">
              <h1 className="text-2xl font-bold text-foreground leading-tight mb-3">
                {article.title}
              </h1>
              <div className="flex items-center gap-3">
                {article.readingTime && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {article.readingTime} min read
                  </span>
                )}
                {article.summary && (
                  <>
                    <span className="text-border">·</span>
                    <p className="text-xs text-muted-foreground italic">{article.summary}</p>
                  </>
                )}
              </div>
            </header>

            {/* Divider */}
            <div className="h-px bg-border mb-8" />

            {/* Sections */}
            <div className="space-y-8">
              {article.body.map((section) => (
                <div
                  key={section.heading ?? section.text ?? section.steps?.join("|") ?? section.tips?.join("|")}
                  ref={el => {
                    if (section.heading) sectionRefs.current[section.heading] = el
                  }}
                  data-heading={section.heading}
                  className="space-y-4"
                >
                  {section.heading && (
                    <h2 className="text-base font-bold text-foreground leading-snug">
                      {section.heading}
                    </h2>
                  )}

                  {section.text && (
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {section.text}
                    </p>
                  )}

                  {section.steps && (
                    <ol className="space-y-3">
                      {section.steps.map((step, j) => (
                        <li key={step} className="flex gap-3.5 text-sm text-foreground/70 leading-relaxed">
                          <span className="shrink-0 size-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                            {j + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {section.tips && (
                    <ul className="space-y-2.5">
                      {section.tips.map((tip) => (
                        <li key={tip} className="flex gap-3 text-sm text-foreground/70 leading-relaxed">
                          <span className="shrink-0 size-1.5 rounded-full bg-muted-foreground mt-2" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.callout && (
                    <div className="flex gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-3.5">
                      <span className="shrink-0 text-base mt-0.5">💡</span>
                      <p className="text-sm text-primary leading-relaxed">{section.callout}</p>
                    </div>
                  )}

                  {section.warning && (
                    <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3.5">
                      <span className="shrink-0 text-base mt-0.5">⚠️</span>
                      <p className="text-sm text-amber-400 leading-relaxed">{section.warning}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Divider before related */}
            {relatedArticles.length > 0 && (
              <div className="mt-12 pt-8 border-t border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Related articles</p>
                <div className="space-y-2">
                  {relatedArticles.map(rel => (
                    <Link
                      key={rel.id}
                      href={`/dashboard/learn/${rel.id}`}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-border hover:border-primary/20 hover:bg-primary/5 transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {rel.title}
                        </p>
                        {rel.readingTime && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="size-3" /> {rel.readingTime} min read
                          </span>
                        )}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back link */}
            <div className="mt-8">
              <Link
                href="/dashboard/learn"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                Back to all articles
              </Link>
            </div>
          </article>

          {/* Sticky TOC , desktop only, only if there are headings */}
          {headings.length > 1 && (
            <aside className="hidden lg:block w-52 shrink-0 sticky top-0">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  On this page
                </p>
                <nav className="space-y-1">
                  {headings.map(heading => (
                    <button type="button"
                      key={heading}
                      onClick={() => scrollTo(heading)}
                      className={`w-full text-left text-xs leading-snug px-2.5 py-1.5 rounded-md transition-all ${
                        activeHeading === heading
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
