import { describe, expect, it } from "vitest"
import {
  initialShopifySectionState,
  shopifySectionReducer,
} from "./ShopifySection"

describe("shopifySectionReducer", () => {
  it("records link failures without leaving search mode", () => {
    const searching = shopifySectionReducer(
      { ...initialShopifySectionState, mode: "search", query: "ada" },
      { type: "linkError", error: "Failed to link customer." },
    )
    expect(searching.linkError).toBe("Failed to link customer.")
    expect(searching.mode).toBe("search")
  })

  it("clears link errors when exiting search", () => {
    const next = shopifySectionReducer(
      { ...initialShopifySectionState, mode: "search", linkError: "Failed to link customer." },
      { type: "exitSearch" },
    )
    expect(next.linkError).toBeNull()
    expect(next.mode).toBe("view")
  })

  it("clears create errors when starting a new create attempt", () => {
    const next = shopifySectionReducer(
      { ...initialShopifySectionState, createError: "Email already taken." },
      { type: "creating", creating: true },
    )
    expect(next.isCreating).toBe(true)
    expect(next.createError).toBeNull()
  })
})
