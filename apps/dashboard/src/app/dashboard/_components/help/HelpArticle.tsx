"use client"

import { withAgentName, type Article } from "./content/index"

export default function HelpArticle({ article, agentName }: { article: Article; agentName: string }) {
  const named = (text: string) => withAgentName(text, agentName)

  return (
    <div className="p-5 space-y-5">
      <h2 className="text-base font-bold text-foreground leading-snug">{named(article.title)}</h2>

      {article.body.map((section) => (
        <div key={section.heading ?? section.text ?? section.steps?.join("|") ?? section.tips?.join("|")} className="space-y-2">
          {section.heading && (
            <p className="text-xs font-bold text-foreground uppercase tracking-wide">{named(section.heading)}</p>
          )}

          {section.text && (
            <p className="text-sm text-muted-foreground leading-relaxed">{named(section.text)}</p>
          )}

          {section.steps && (
            <ol className="space-y-2">
              {section.steps.map((step, j) => (
                  <li key={step} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
                  <span className="shrink-0 size-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                    {j + 1}
                  </span>
                  {named(step)}
                </li>
              ))}
            </ol>
          )}

          {section.tips && (
            <div className="bg-amber-600/10 border border-amber-600/20 rounded-md px-3.5 py-3 space-y-1.5">
              {section.tips.map((tip) => (
                <p key={tip} className="text-xs text-amber-600 leading-relaxed flex gap-2">
                  <span className="shrink-0 mt-px">💡</span>
                  {named(tip)}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
