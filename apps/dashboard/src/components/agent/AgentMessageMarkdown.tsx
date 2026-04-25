"use client"

import ReactMarkdown, { type Components } from "react-markdown"

const ALLOWED_ELEMENTS = ["p", "strong", "em", "a", "br", "ul", "ol", "li", "code"]

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
  ),
}

const WRAPPER_CLASS =
  "text-sm text-foreground leading-relaxed " +
  "[&_p]:mt-0 [&_p+p]:mt-2 " +
  "[&_strong]:font-medium [&_strong]:text-foreground/90 " +
  "[&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-violet-300 " +
  "[&_ul]:my-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-white/30 " +
  "[&_ol]:my-1.5 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:marker:text-white/30 " +
  "[&_li]:my-0.5 " +
  "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]"

export function AgentMessageMarkdown({ text }: { text: string }) {
  return (
    <div className={WRAPPER_CLASS}>
      <ReactMarkdown allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
