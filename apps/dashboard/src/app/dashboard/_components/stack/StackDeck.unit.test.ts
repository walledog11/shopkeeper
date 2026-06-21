/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StackDeck } from "./StackDeck"

vi.mock("../home/NeedsYouSwipeCard", async () => {
  const React = await import("react")

  return {
    SwipeCard({
      draggable,
      onCommitLeft,
      children,
      ref,
    }: {
      draggable: boolean
      onCommitLeft: () => void
      children: React.ReactNode
      ref?: React.Ref<{ flyOff: (sign: -1 | 1) => Promise<boolean> }>
    }) {
      React.useImperativeHandle(ref, () => ({
        flyOff: async () => true,
      }), [])

      return React.createElement(
        "div",
        { "data-draggable": String(draggable), "data-testid": "swipe-card" },
        children,
        React.createElement(
          "button",
          {
            "aria-label": "Mock swipe left",
            onClick: () => {
              if (draggable) onCommitLeft()
            },
            type: "button",
          },
          "swipe",
        ),
      )
    },
  }
})

interface DeckItem {
  id: string
  title: string
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
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

function renderDeck(props: {
  items: DeckItem[]
  activeId?: string | null
  isDraggable?: boolean | ((item: DeckItem) => boolean)
  disableControlsWhenNotDraggable?: boolean
  empty?: React.ReactNode
}) {
  container ??= document.createElement("div")
  if (!container.isConnected) document.body.appendChild(container)
  root ??= createRoot(container)

  act(() => {
    root?.render(
      React.createElement(StackDeck<DeckItem>, {
        items: props.items,
        getId: (item) => item.id,
        activeId: props.activeId,
        isDraggable: props.isDraggable,
        disableControlsWhenNotDraggable: props.disableControlsWhenNotDraggable,
        empty: props.empty,
        labels: { previous: "Previous item", next: "Next item" },
        renderCard: (item) => React.createElement("article", null, item.title),
      }),
    )
  })

  return container
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

const items: DeckItem[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta" },
  { id: "c", title: "Gamma" },
]

describe("StackDeck", () => {
  it("renders the empty state", () => {
    const view = renderDeck({
      items: [],
      empty: React.createElement("p", null, "Nothing here"),
    })

    expect(view.textContent).toContain("Nothing here")
  })

  it("renders one item without controls", () => {
    const view = renderDeck({ items: [items[0]] })

    expect(view.textContent).toContain("Alpha")
    expect(view.querySelector('button[aria-label="Previous item"]')).toBeNull()
    expect(view.querySelector('button[aria-label="Next item"]')).toBeNull()
  })

  it("navigates multiple items with arrows", async () => {
    const view = renderDeck({ items: items.slice(0, 2) })

    expect(view.textContent).toContain("Alpha")
    expect(view.textContent).toContain("1 of 2")

    const next = view.querySelector('button[aria-label="Next item"]')
    expect(next).not.toBeNull()
    await click(next as Element)

    expect(view.textContent).toContain("Beta")
    expect(view.textContent).toContain("2 of 2")
  })

  it("preserves the current item when item lists change", async () => {
    const view = renderDeck({ items })
    const next = view.querySelector('button[aria-label="Next item"]')
    expect(next).not.toBeNull()
    await click(next as Element)

    expect(view.textContent).toContain("Beta")

    renderDeck({ items: items.slice(1) })

    expect(view.textContent).toContain("Beta")
    expect(view.textContent).toContain("1 of 2")
  })

  it("disables controls and swipe commits when dragging is disabled", async () => {
    const view = renderDeck({
      items: items.slice(0, 2),
      isDraggable: false,
      disableControlsWhenNotDraggable: true,
    })

    const next = view.querySelector('button[aria-label="Next item"]') as HTMLButtonElement | null
    expect(next?.disabled).toBe(true)
    expect(view.querySelector('[data-testid="swipe-card"]')?.getAttribute("data-draggable")).toBe("false")

    const swipe = view.querySelector('button[aria-label="Mock swipe left"]')
    expect(swipe).not.toBeNull()
    await click(swipe as Element)

    expect(view.textContent).toContain("Alpha")
    expect(view.textContent).toContain("1 of 2")
  })
})
