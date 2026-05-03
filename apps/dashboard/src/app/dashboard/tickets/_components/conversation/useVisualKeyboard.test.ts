import { describe, expect, it } from "vitest"
import { getVisualKeyboardState } from "./useVisualKeyboard"

describe("getVisualKeyboardState", () => {
  it("opens on mobile focus before the visual viewport has resized", () => {
    expect(getVisualKeyboardState({
      focusedEditable: true,
      innerHeight: 800,
      isMobile: true,
      visualViewport: { height: 800, offsetTop: 0 },
    })).toEqual({
      keyboardInset: 0,
      keyboardOpen: true,
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
