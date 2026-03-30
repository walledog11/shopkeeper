"use client"

import type { Article } from "./content/index"

export default function HelpArticle({ article }: { article: Article }) {
  return (
    <div className="px-5 py-5 space-y-5">
      <h2 className="text-base font-bold text-slate-900 leading-snug">{article.title}</h2>

      {article.body.map((section, i) => (
        <div key={i} className="space-y-2">
          {section.heading && (
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wide">{section.heading}</p>
          )}

          {section.text && (
            <p className="text-sm text-slate-600 leading-relaxed">{section.text}</p>
          )}

          {section.steps && (
            <ol className="space-y-2">
              {section.steps.map((step, j) => (
                <li key={j} className="flex gap-3 text-sm text-slate-600 leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {j + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          )}

          {section.tips && (
            <div className="bg-amber-50 border border-amber-100 rounded-md px-3.5 py-3 space-y-1.5">
              {section.tips.map((tip, j) => (
                <p key={j} className="text-xs text-amber-800 leading-relaxed flex gap-2">
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
