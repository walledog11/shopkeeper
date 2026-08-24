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
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("SearchFilterBar", () => {
  it("renders a separate search field and filter pills", async () => {
    const onValueChange = vi.fn()
    const onToggle = vi.fn()

    await act(async () => {
      root.render(
        <SearchFilterBar
          value=""
          onValueChange={onValueChange}
          placeholder="Search conversations"
          aria-label="Search conversations"
          filters={[
            { id: "closed", label: "Closed", pressed: false, onClick: onToggle, testId: "inbox-toggle-closed" },
          ]}
        />,
      )
    })

    const input = container.querySelector('input[type="search"]')
    const pill = container.querySelector('[data-testid="inbox-toggle-closed"]')
    expect(input).toBeTruthy()
    expect(input?.getAttribute("placeholder")).toBe("Search conversations")
    expect(input?.getAttribute("aria-label")).toBe("Search conversations")
    expect(pill?.textContent).toBe("Closed")
    expect(pill?.getAttribute("aria-pressed")).toBe("false")
    expect(pill?.parentElement).not.toBe(input?.parentElement)

    await act(async () => {
      (pill as HTMLButtonElement).click()
    })
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it("marks exclusive filters as tabs when grouped as a tablist", async () => {
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

    const tablist = container.querySelector('[role="tablist"]')
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tablist?.getAttribute("aria-label")).toBe("Shop sections")
    expect(tabs).toHaveLength(2)
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true")
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false")
  })
})
