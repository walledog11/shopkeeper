import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"

export function ArticleCard({
  article, active, onClick,
}: {
  article: ArticleWithBase
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70 focus-visible:ring-inset ${active ? 'bg-foreground/[0.06] border-l-2 border-solid border-l-green-600' : 'hover:bg-foreground/[0.02]'}`}
    >
      <p className={`text-xs font-bold mb-1 truncate text-white`}>
        {article.title}
      </p>
      <p className="text-xs text-foreground/90 leading-relaxed font-light line-clamp-2 mb-2">{article.body}</p>
      <div className="flex items-center gap-2 text-xs text-foreground/30">
        <span className="truncate">{article.baseName}</span>
        <span className="ml-auto">{formatDate(article.updatedAt)}</span>
      </div>
    </button>
  )
}
