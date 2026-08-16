/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import HelpArticle from "./HelpArticle"
import { ALL_CATEGORIES, withAgentName, type Article } from "./content/index"

function allText(): string {
  return ALL_CATEGORIES.flatMap(category => [
    category.title,
    category.description,
    ...category.articles.flatMap(article => [
      article.title,
      article.summary ?? "",
      ...article.body.flatMap(section => [
        section.heading ?? "",
        section.text ?? "",
        section.callout ?? "",
        section.warning ?? "",
        ...(section.steps ?? []),
        ...(section.tips ?? []),
      ]),
    ]),
  ]).join("\n")
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe("help content", () => {
  it("never names the agent as the product or as 'AI'", () => {
    const text = allText()
    // "Shopkeeper" is fine for the product ("your Shopkeeper inbound address").
    // These are the phrasings that made the product speak about its own agent
    // in the third person, or called it the AI.
    expect(text).not.toMatch(/Shopkeeper's AI/)
    expect(text).not.toMatch(/\bAI drafts?\b/)
    expect(text).not.toMatch(/AI-generated/)
    expect(text).not.toMatch(/AI-assisted/)
    expect(text).not.toMatch(/AI summaries/)
  })

  it("does not document UI that no longer exists", () => {
    const text = allText()
    for (const removed of ["Draft with Shopkeeper", "Shopkeeper Context", "Resolve button", "Closed tab"]) {
      expect(text).not.toContain(removed)
    }
  })

  it("substitutes the agent display name into rendered copy", () => {
    const article: Article = {
      id: "t",
      title: "Working with {agent}",
      body: [
        { heading: "About {agent}", text: "{agent} drafts a reply.", steps: ["Ask {agent}."], tips: ["{agent} waits for you."] },
      ],
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root?.render(React.createElement(HelpArticle, { article })))

    expect(container.textContent).toContain("Working with Shopkeeper")
    expect(container.textContent).toContain("Shopkeeper drafts a reply.")
    expect(container.textContent).toContain("Ask Shopkeeper.")
    expect(container.textContent).toContain("Shopkeeper waits for you.")
    expect(container.textContent).not.toContain("{agent}")
  })

  it("leaves no unsubstituted token in the shipped copy", () => {
    expect(withAgentName(allText(), "Wren")).not.toContain("{agent}")
  })
})
