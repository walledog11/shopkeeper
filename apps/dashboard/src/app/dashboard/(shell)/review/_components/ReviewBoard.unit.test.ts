/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReviewBoard, type ReviewBoardState, type ReviewColumnState } from "./ReviewBoard"
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
    feedback: null,
    ...overrides,
  }
}

function emptyColumn(overrides: Partial<ReviewColumnState> = {}): ReviewColumnState {
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

function boardState(overrides: Partial<Record<keyof ReviewBoardState, Partial<ReviewColumnState>>> = {}): ReviewBoardState {
  return {
    attention: emptyColumn(overrides.attention),
    auto: emptyColumn(overrides.auto),
    store: emptyColumn(overrides.store),
    approved: emptyColumn(overrides.approved),
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  class TestResizeObserver {
    observe() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  })

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
  })

  Element.prototype.hasPointerCapture = function () { return false }
  Element.prototype.setPointerCapture = function () {}
  Element.prototype.releasePointerCapture = function () {}

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
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

function firstReviewCardButton(rootElement: ParentNode) {
  const button = Array.from(rootElement.querySelectorAll("button"))
    .find((element) => element.querySelector("h3"))
  if (!button) throw new Error("Review card button not found")
  return button
}

function reviewDialog() {
  return document.body.querySelector('[role="dialog"]')
}

describe("ReviewBoard", () => {
  it("renders loading and empty column states", () => {
    const view = render(React.createElement(ReviewBoard, {
      columns: boardState({ attention: { isLoading: true } }),
      isNew: () => false,
      visibleColumnIds: ["attention", "auto"],
    }))

    expect(view.querySelector('[data-testid="review-column-loading"]')).not.toBeNull()
    expect(view.textContent).toContain("Nothing auto-sent")
  })

  it("renders multiple items as a swipeable stack that expands when clicked", () => {
    const first = entry()
    const second = entry({
      id: "22222222-2222-4222-8222-222222222222",
      customerHandle: "jamie@example.com",
      summary: "Customer asked about a return.",
    })
    const view = render(React.createElement(ReviewBoard, {
      columns: boardState({ auto: { entries: [first, second] } }),
      isNew: () => false,
      visibleColumnIds: ["auto"],
    }))

    expect(view.querySelector('[data-testid="review-stack-deck"]')).not.toBeNull()
    expect(view.querySelector('[data-testid="review-stack-expanded"]')).toBeNull()
    expect(view.querySelector('button[aria-label="Previous review item"]')).not.toBeNull()
    expect(view.querySelector('button[aria-label="Next review item"]')).not.toBeNull()

    click(firstReviewCardButton(view))

    expect(view.querySelector('[data-testid="review-stack-expanded"]')).not.toBeNull()
    expect(reviewDialog()).toBeNull()
  })

  it("opens and closes the detail modal", () => {
    const item = entry({
      actions: [
        action(),
        action({ tool: "create_refund", result: "Refunded $42." }),
      ],
    })
    const view = render(React.createElement(ReviewBoard, {
      columns: boardState({ auto: { entries: [item] } }),
      isNew: () => false,
      visibleColumnIds: ["auto"],
    }))

    expect(reviewDialog()).toBeNull()
    click(firstReviewCardButton(view))

    expect(reviewDialog()?.textContent).toContain("Tool outcomes")
    expect(reviewDialog()?.textContent).toContain("Customer asked about shipping.")
    expect(reviewDialog()?.textContent).toContain("Refunded $42.")
    expect(reviewDialog()?.textContent).not.toContain("Sent reply.")

    const doneButton = Array.from(reviewDialog()?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent === "Done")
    expect(doneButton).not.toBeUndefined()

    click(doneButton as Element)
    expect(reviewDialog()).toBeNull()
  })

  it("optimistically updates feedback", () => {
    const item = entry()
    const view = render(React.createElement(ReviewBoard, {
      columns: boardState({ auto: { entries: [item] } }),
      isNew: () => false,
      visibleColumnIds: ["auto"],
    }))

    const feedbackButton = Array.from(view.querySelectorAll("button"))
      .find((button) => button.textContent === "Looks good")
    expect(feedbackButton).not.toBeUndefined()

    click(feedbackButton as Element)

    expect(view.textContent).toContain("Looked good")
    expect(fetch).toHaveBeenCalledWith(
      "/api/agent/actions/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ turnId: item.id, feedback: "good" }),
      }),
    )
  })

  it("renders source links for tickets, orders, and agent sessions", () => {
    const order = entry({
      id: "22222222-2222-4222-8222-222222222222",
      threadId: null,
      channelType: null,
      instruction: "order-risk-review:998877",
      summary: "Flagged order #1001 for review: country mismatch.",
      actions: [action({ tool: "flag_order", result: "Country mismatch." })],
    })
    const agent = entry({
      id: "33333333-3333-4333-8333-333333333333",
      threadId: "session-9",
      channelType: "dashboard_agent",
      instruction: "How many orders shipped today?",
      customerHandle: "Dashboard session",
      actions: [action({ tool: "get_shopify_orders", result: "Fetched orders." })],
      mode: "read_only",
    })
    const ticket = entry()

    const view = render(React.createElement(ReviewBoard, {
      columns: boardState({
        attention: { entries: [order] },
        auto: { entries: [ticket] },
        approved: { entries: [agent] },
      }),
      isNew: () => false,
      visibleColumnIds: ["attention", "auto", "approved"],
    }))

    const hrefs = Array.from(view.querySelectorAll("a")).map((anchor) => anchor.getAttribute("href"))
    expect(hrefs).toContain("/dashboard/orders?q=%231001")
    expect(hrefs).toContain("/dashboard/tickets?thread=thread-1")
    expect(hrefs).toContain("/dashboard?openAgent=1&session=session-9")
  })
})
