"use client"

import Link from "next/link"
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react"
import { formatDate } from "@/lib/format/date"
import type { MemoryBook, MemoryBookPage } from "./memory-books"

function latestUpdate(book: MemoryBook): string | null {
  const latest = book.pages.reduce<string | null>((current, page) => {
    if (!page.updatedAt) return current
    if (!current || +new Date(page.updatedAt) > +new Date(current)) return page.updatedAt
    return current
  }, null)
  return latest ? formatDate(latest) : null
}

function SourceCard({
  source,
  active = false,
  onOpen,
}: {
  source: MemoryBook
  active?: boolean
  onOpen: () => void
}) {
  const updated = latestUpdate(source)
  const recentTitles = source.pages.slice(0, 3).map(page => page.title)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={active}
      className={`group flex h-72 w-full flex-col gap-3 rounded-3xl border bg-card px-5 py-5 text-left font-sans shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 ${
        active ? "border-foreground/30" : "border-border hover:border-foreground/[0.16]"
      }`}
    >
      <span className="block text-xl font-semibold leading-snug tracking-tight text-foreground">
        {source.title}
      </span>
      <span className="block text-sm leading-relaxed text-muted-foreground line-clamp-3">
        {source.description}
      </span>

      <span className="mt-auto block border-t border-border pt-3">
        {recentTitles.length > 0 ? (
          <span className="block space-y-1.5">
            {recentTitles.map((title, index) => <span key={`${title}:${index}`} className="block truncate text-xs text-faint">{title}</span>)}
          </span>
        ) : (
          <span className="block text-xs text-faint">No context saved yet</span>
        )}
      </span>

      <span className="flex items-center justify-between gap-3 text-xs">
        <span className="text-faint">{updated ? `Updated ${updated}` : ""}</span>
        <span className="font-semibold text-muted-foreground group-hover:text-foreground">{active ? "Collapse" : "View context"}</span>
      </span>
    </button>
  )
}

function EntryCard({ page, onOpen }: { page: MemoryBookPage; onOpen: (() => void) | null }) {
  const content = (
    <>
      <span className="flex items-center justify-between gap-3 text-xs text-faint">
        <span>{page.articleId ? "Saved context" : "Core context"}</span>
        {page.updatedAt && <span className="shrink-0 tabular-nums">{formatDate(page.updatedAt)}</span>}
      </span>
      <span className="mt-5 block font-sans text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
        {page.title}
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground line-clamp-5">{page.body}</span>
      {onOpen && <span className="mt-auto border-t border-border pt-3 text-right text-xs font-semibold text-muted-foreground group-hover:text-foreground">Open</span>}
    </>
  )

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-72 w-full flex-col rounded-3xl border border-border bg-card px-5 py-5 text-left font-sans shadow-sm transition-colors hover:border-foreground/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25"
    >
      {content}
    </button>
  ) : (
    <article className="flex h-72 w-full flex-col rounded-3xl border border-border bg-card px-5 py-5 font-sans shadow-sm">{content}</article>
  )
}

function FanOutPanel({
  source,
  onAddNote,
  onOpenArticle,
}: {
  source: MemoryBook
  onAddNote: () => void
  onOpenArticle: (id: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const settingsSource = source.kind === "store" || source.kind === "tone"

  return (
    <div className="w-full pb-2 pt-1 font-sans">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Context</h2>
        </div>
        <div className="flex items-center gap-2">
          {source.canAddNote && <button type="button" onClick={onAddNote} className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-semibold text-background">Add note</button>}
          {settingsSource && <Link href="/dashboard/agent/configure" className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">Edit settings</Link>}
        </div>
      </div>

      {source.pages.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {source.pages.map((page, index) => (
            <m.div
              key={page.id}
              className="will-change-transform"
              initial={reduceMotion ? false : {
                opacity: 0,
                y: -36,
                scale: 0.985,
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduceMotion ? { duration: 0 } : {
                delay: Math.min(index, 8) * 0.045,
                duration: 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <EntryCard page={page} onOpen={page.articleId ? () => onOpenArticle(page.articleId as string) : null} />
            </m.div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-foreground/[0.10] bg-card/35 px-6 py-10 text-center font-sans">
          <p className="text-sm font-semibold text-muted-foreground">No context here yet</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-faint">{source.canAddNote ? "Add the first note to this source." : settingsSource ? "Add this context in your agent settings." : "Context will appear here as this source learns or syncs."}</p>
          {source.canAddNote && <button type="button" onClick={onAddNote} className="mt-4 inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-semibold text-background">Add first note</button>}
        </div>
      )}
    </div>
  )
}

export function MemoryLibrary({
  books,
  hasActiveSearch,
  selectedBookId,
  onSelectBook,
  onCloseBook,
  onAddNote,
  onOpenArticle,
}: {
  books: MemoryBook[]
  hasActiveSearch: boolean
  selectedBookId: string | null
  onSelectBook: (id: string) => void
  onCloseBook: () => void
  onAddNote: () => void
  onOpenArticle: (id: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const populatedSources = books.filter(source => source.pages.length > 0)
  const selectedSource = selectedBookId ? populatedSources.find(source => source.id === selectedBookId) ?? null : null

  return (
    <section aria-label="Memory" className="w-full font-sans">
      {populatedSources.length > 0 ? (
        <LazyMotion features={domAnimation}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {populatedSources.map(source => {
              const active = selectedSource?.id === source.id
              return (
                <m.div
                  key={source.id}
                  layout="position"
                  transition={reduceMotion ? { duration: 0 } : { layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                  className="min-w-0 will-change-transform"
                >
                  <SourceCard
                    source={source}
                    active={active}
                    onOpen={() => active ? onCloseBook() : onSelectBook(source.id)}
                  />
                  {active && (
                    <div className="mt-3">
                      <FanOutPanel source={source} onAddNote={onAddNote} onOpenArticle={onOpenArticle} />
                    </div>
                  )}
                </m.div>
              )
            })}
          </div>
        </LazyMotion>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-foreground/[0.10] bg-card/35 px-6 py-10 text-center font-sans">
          <p className="text-sm font-semibold text-muted-foreground">{hasActiveSearch ? "No matching memory" : "No memory yet"}</p>
          <p className="mt-1 text-xs text-faint">{hasActiveSearch ? "Try a different search." : "Add a note to create your first source."}</p>
        </div>
      )}
    </section>
  )
}
