/**
 * @vitest-environment jsdom
 */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SearchFilterBarProps } from "@/components/ui/search-filter-bar"
import { InboxControls } from "./InboxControls"

vi.mock("./InboxRealtimeStatus", () => ({
  InboxRealtimeStatus: () => null,
}))

const searchFilterBar = vi.hoisted(() => vi.fn((_props: SearchFilterBarProps) => null))

vi.mock("@/components/ui/search-filter-bar", () => ({
  SearchFilterBar: (props: SearchFilterBarProps) => {
    searchFilterBar(props)
    return null
  },
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  searchFilterBar.mockClear()
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe("InboxControls", () => {
  it("wires the open/all filter menu to includeClosed toggles", () => {
    const onToggleClosed = vi.fn()
    const onSearchChange = vi.fn()

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <InboxControls
          searchQuery="maria"
          isSearchLoading={false}
          includeClosed={false}
          onSearchChange={onSearchChange}
          onToggleClosed={onToggleClosed}
        />,
      )
    })

    const props = searchFilterBar.mock.calls.at(-1)![0]
    expect(props.value).toBe("maria")
    expect(props.filterGroup?.testId).toBe("inbox-toggle-closed")
    expect(props.filters?.map(filter => filter.id)).toEqual(["open", "all"])

    props.filters?.find(filter => filter.id === "all")?.onClick()
    expect(onToggleClosed).toHaveBeenCalledTimes(1)

    act(() => {
      root!.render(
        <InboxControls
          searchQuery=""
          isSearchLoading
          includeClosed
          onSearchChange={onSearchChange}
          onToggleClosed={onToggleClosed}
        />,
      )
    })

    const allSelected = searchFilterBar.mock.calls.at(-1)![0]
    expect(allSelected.loading).toBe(true)
    expect(allSelected.filters?.find(filter => filter.id === "open")?.pressed).toBe(false)
    allSelected.filters?.find(filter => filter.id === "open")?.onClick()
    expect(onToggleClosed).toHaveBeenCalledTimes(2)
  })
})
