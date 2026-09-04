import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import Composer from "./Composer"
import type { ComposerProps } from "./composer-types"
import type { ComposerAttachments, StagedAttachment } from "../../../_hooks/useComposerAttachments"

vi.mock("swr", () => ({ default: () => ({ data: undefined }) }))
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }))

function attachmentsState(staged: StagedAttachment[]): ComposerAttachments {
  return {
    attachments: staged,
    attachmentRefs: staged.flatMap(a => (a.ref ? [a.ref] : [])),
    attachmentsBlockSend: staged.some(a => a.ref === null),
    addFiles: vi.fn(),
    removeAttachment: vi.fn(),
    clearAttachments: vi.fn(),
  }
}

function file(overrides: Partial<StagedAttachment> = {}): StagedAttachment {
  return {
    localId: "attachment-0",
    name: "receipt.pdf",
    bytes: 2048,
    ref: "blob:attachments/org/id/receipt.pdf",
    error: null,
    ...overrides,
  }
}

function render(props: Partial<ComposerProps> = {}) {
  return renderToStaticMarkup(createElement(Composer, {
    customerName: "Ada",
    channelType: "email",
    value: "Here you go",
    isSending: false,
    error: null,
    onChange: vi.fn(),
    onSend: vi.fn(),
    attachments: attachmentsState([]),
    ...props,
  } as ComposerProps))
}

// The send button carries `disabled:` Tailwind classes whatever its state, so
// the class list cannot be used to read the state — only the boolean attribute
// on the button's own tag can.
function sendIsDisabled(html: string): boolean {
  const tag = html.match(/<button[^>]*data-testid="reply-composer-send"[^>]*>/)
  if (!tag) throw new Error("send button not rendered")
  return / disabled=""/.test(tag[0])
}

describe("Composer attachments", () => {
  it("offers the attach control on an email thread", () => {
    expect(render()).toContain('data-testid="composer-attach"')
  })

  it("hides it on a channel that cannot carry attachments", () => {
    expect(render({ channelType: "ig_dm" })).not.toContain('data-testid="composer-attach"')
  })

  // Agent mode addresses the agent, not the customer, so there is nothing to
  // attach a file to.
  it("hides it while the composer is addressing the agent", () => {
    expect(render({ isAgentMode: true })).not.toContain('data-testid="composer-attach"')
  })

  it("renders a chip per staged file with its size", () => {
    const html = render({ attachments: attachmentsState([file()]) })

    expect(html).toContain("receipt.pdf")
    expect(html).toContain("2 KB")
    expect(html).toContain("Remove receipt.pdf")
  })

  it("shows the failure on the chip instead of the size", () => {
    const html = render({
      attachments: attachmentsState([file({ ref: null, error: "Upload failed" })]),
    })

    expect(html).toContain("Upload failed")
    expect(html).not.toContain("2 KB")
  })

  // A file mid-upload must hold the send rather than drop out of it silently.
  it("disables send while an upload is still in flight", () => {
    expect(sendIsDisabled(render({ attachments: attachmentsState([file({ ref: null })]) })))
      .toBe(true)
  })

  it("disables send while an upload has failed", () => {
    expect(sendIsDisabled(render({
      attachments: attachmentsState([file({ ref: null, error: "Upload failed" })]),
    }))).toBe(true)
  })

  it("enables send once every upload has landed", () => {
    expect(sendIsDisabled(render({ attachments: attachmentsState([file()]) }))).toBe(false)
  })
})
