/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewList, type ReviewListState } from "./ReviewList"
import type { ActionLogEntry } from "@/types"

vi.mock("next/image", async () => {
  const React = await import("react")
  return {
    default: function MockImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
      return React.createElement("img", props)
    },
  }
})

vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: function MockLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
      return React.createElement("a", props, props.children)
    },
  }
})

type Action = ActionLogEntry["actions"][number]

function action(overrides: Partial<Action> = {}): Action {
  return {
    tool: "send_reply",
    result: "Sent reply.",
    status: "success",
    input: { text: "Thanks for reaching out." },
    durationMs: 10,
    ...overrides,
  }
}

function entry(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sentAt: "2026-06-20T12:00:00.000Z",
    threadId: "thread-1",
    channelType: "email",
    threadTag: "Shipping",
    customerHandle: "alex@example.com",
    instruction: null,
    summary: "Customer asked about shipping.",
    actions: [action()],
    mode: "auto_executed",
    approver: null,
    ...overrides,
  }
}

function listState(overrides: Partial<ReviewListState> = {}): ReviewListState {
  return {
    entries: [],
    error: null,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function render(element: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(element))
  return container
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

function rowButton(rootElement: ParentNode) {
  const button = Array.from(rootElement.querySelectorAll("button")).find(element => element.querySelector("h3"))
  if (!button) throw new Error("Review row button not found")
  return button
}

function reviewDialog() {
  return document.body.querySelector('[role="dialog"]')
}

describe("ReviewList", () => {
  it("shows every entry at once instead of one card per deck", () => {
    const view = render(React.createElement(ReviewList, {
      state: listState({
        entries: [
          entry(),
          entry({ id: "22222222-2222-4222-8222-222222222222", customerHandle: "jamie@example.com" }),
          entry({ id: "33333333-3333-4333-8333-333333333333", customerHandle: "sam@example.com" }),
        ],
      }),
      activeFilter: "all",
      isNew: () => false,
      onFilterChange: vi.fn(),
    }))

    expect(view.querySelectorAll('[data-testid="review-list"] > li')).toHaveLength(3)
  })

  it("renders one status pill per row, not a status/mode pair", () => {
    const view = render(React.createElement(ReviewList, {
      state: listState({ entries: [entry({ mode: "read_only", actions: [action({ tool: "get_shopify_orders" })] })] }),
      activeFilter: "all",
      isNew: () => false,
      onFilterChange: vi.fn(),
    }))

    const readOnlyMentions = (view.textContent ?? "").match(/Read only/g) ?? []
    expect(readOnlyMentions).toHaveLength(1)
  })

  it("shows the active filter's empty state and current filter label", () => {
    const view = render(React.createElement(ReviewList, {
      state: listState(),
      activeFilter: "attention",
      isNew: () => false,
      onFilterChange: vi.fn(),
    }))

    expect(view.textContent).toContain("Nothing needs review")

    const trigger = view.querySelector('[data-slot="dropdown-menu-trigger"]')
    expect(trigger?.getAttribute("aria-label")).toBe("Filter the audit trail")
    expect(trigger?.textContent).toContain("Needs review")
  })

  it("opens the detail dialog from a row", () => {
    const view = render(React.createElement(ReviewList, {
      state: listState({
        entries: [entry({ actions: [action(), action({ tool: "create_refund", result: "Refunded $42." })] })],
      }),
      activeFilter: "all",
      isNew: () => false,
      onFilterChange: vi.fn(),
    }))

    expect(reviewDialog()).toBeNull()
    click(rowButton(view))

    expect(reviewDialog()?.textContent).toContain("Refunded $42.")
  })
})
