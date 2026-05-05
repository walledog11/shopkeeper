import { describe, expect, it } from "vitest"
import { getVisualKeyboardState } from "./useVisualKeyboard"

describe("getVisualKeyboardState", () => {
  it("does not open from focus alone when the visual viewport has not shrunk", () => {
    expect(getVisualKeyboardState({
      focusedEditable: true,
      innerHeight: 800,
      isMobile: true,
      isCoarsePointer: true,
      visualViewport: { height: 800, offsetTop: 0 },
    })).toEqual({
      keyboardInset: 0,
      keyboardOpen: false,
      visualViewportHeight: 800,
    })
  })

  it("uses the reduced visual viewport to calculate the keyboard inset", () => {
    expect(getVisualKeyboardState({
      focusedEditable: true,
      innerHeight: 800,
      isMobile: true,
      visualViewport: { height: 500, offsetTop: 0 },
    })).toEqual({
      keyboardInset: 300,
      keyboardOpen: true,
      visualViewportHeight: 500,
    })
  })

  it("falls back to focus on touch devices when visualViewport is unavailable", () => {
    expect(getVisualKeyboardState({
      focusedEditable: true,
      innerHeight: 800,
      isMobile: true,
      isCoarsePointer: true,
      visualViewport: null,
    })).toEqual({
      keyboardInset: 0,
      keyboardOpen: true,
      visualViewportHeight: 800,
    })
  })

  it("does not report a keyboard for desktop viewport changes", () => {
    expect(getVisualKeyboardState({
      focusedEditable: true,
      innerHeight: 800,
      isMobile: false,
      visualViewport: { height: 500, offsetTop: 0 },
    })).toEqual({
      keyboardInset: 0,
      keyboardOpen: false,
      visualViewportHeight: 500,
    })
  })
})
