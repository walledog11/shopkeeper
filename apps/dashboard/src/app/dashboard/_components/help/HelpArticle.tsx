"use client"

import type { Article } from "./content/index"

export default function HelpArticle({ article }: { article: Article }) {
  return (
    <div className="px-5 py-5 space-y-5">
      <h2 className="text-base font-bold text-foreground leading-snug">{article.title}</h2>

      {article.body.map((section, i) => (
        <div key={i} className="space-y-2">
          {section.heading && (
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">{section.heading}</p>
          )}

          {section.text && (
            <p className="text-sm text-muted-foreground leading-relaxed">{section.text}</p>
          )}

          {section.steps && (
            <ol className="space-y-2">
              {section.steps.map((step, j) => (
                  <li key={j} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {j + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          )}

          {section.tips && (
            <div className="bg-amber-400/10 border border-amber-400/20 rounded-md px-3.5 py-3 space-y-1.5">
              {section.tips.map((tip, j) => (
                <p key={j} className="text-xs text-amber-400 leading-relaxed flex gap-2">
                  <span className="shrink-0 mt-px">💡</span>
                  {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
