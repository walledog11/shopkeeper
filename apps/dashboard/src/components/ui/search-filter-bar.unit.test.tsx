/**
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SearchFilterBar } from "./search-filter-bar"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("SearchFilterBar", () => {
  it("renders a separate search field and filter menu trigger", async () => {
    const onValueChange = vi.fn()

    await act(async () => {
      root.render(
        <SearchFilterBar
          value=""
          onValueChange={onValueChange}
          placeholder="Search conversations"
          aria-label="Search conversations"
          filterGroup={{ "aria-label": "Conversation status", testId: "inbox-toggle-closed" }}
          filters={[
            { id: "open", label: "Open", pressed: true, onClick: () => undefined },
            { id: "all", label: "All", pressed: false, onClick: () => undefined },
          ]}
        />,
      )
    })

    const input = container.querySelector('input[type="search"]')
    const trigger = container.querySelector('[data-testid="inbox-toggle-closed"]')
    expect(input).toBeTruthy()
    expect(input?.getAttribute("placeholder")).toBe("Search conversations")
    expect(input?.getAttribute("aria-label")).toBe("Search conversations")
    expect(trigger?.textContent).toContain("Open")
    expect(trigger?.querySelector("svg")).toBeTruthy()
    expect(trigger?.parentElement).not.toBe(input?.parentElement)
  })

  it("shows the selected exclusive filter as the menu label", async () => {
    await act(async () => {
      root.render(
        <SearchFilterBar
          value=""
          onValueChange={() => undefined}
          placeholder="Search orders"
          aria-label="Search orders"
          filterGroup={{ role: "tablist", "aria-label": "Shop sections" }}
          filters={[
            { id: "orders", label: "Orders", pressed: true, onClick: () => undefined },
            { id: "customers", label: "Customers", pressed: false, onClick: () => undefined },
          ]}
        />,
      )
    })

    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]')
    expect(trigger?.getAttribute("aria-label")).toBe("Shop sections")
    expect(trigger?.textContent).toContain("Orders")
    expect(trigger?.textContent).not.toContain("Customers")
  })
})
