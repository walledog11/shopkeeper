/**
 * @vitest-environment jsdom
 */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useTicketListRowActions } from "./useTicketListRowActions"
import type { Thread } from "@/types"

const quickApprove = vi.hoisted(() => vi.fn())

vi.mock("./conversation-agent-requests", () => ({
  quickApproveCachedPlan: quickApprove,
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function thread(): Thread {
  return {
    id: "thread-send",
    organizationId: "org-1",
    customerId: "cust-1",
    channelType: "email",
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    lastMessageAt: "2026-08-16T12:00:00.000Z",
    aiSummary: null,
    subject: "Help",
    tag: null,
    escalatedAt: null,
    shopifyCustomerId: null,
    cachedPlanMessageId: "msg-1",
    cachedPlan: { planId: "plan-1" },
    filterStatus: "genuine",
    filterReason: null,
    filterFeedback: "none",
    requestDisposition: null,
    customer: {
      id: "cust-1",
      organizationId: "org-1",
      name: "Maria",
      platformId: "maria@example.com",
      profilePicUrl: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    messages: [],
  }
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe("useTicketListRowActions", () => {
  it("clears the cached plan and toasts after a successful quick send", async () => {
    quickApprove.mockResolvedValue({ ok: true })
    const patchThreadCaches = vi.fn().mockResolvedValue(undefined)
    const revalidateThreadCaches = vi.fn().mockResolvedValue(undefined)
    const showToast = vi.fn()

    let latest: ReturnType<typeof useTicketListRowActions> | null = null

    function Harness() {
      latest = useTicketListRowActions({ patchThreadCaches, revalidateThreadCaches, showToast })
      return null
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(React.createElement(Harness))
    })

    await act(async () => {
      await latest!.handleQuickApproveFromList("thread-send", "plan-1")
    })

    expect(quickApprove).toHaveBeenCalledWith("thread-send", "plan-1")
    expect(patchThreadCaches).toHaveBeenCalledWith("thread-send", expect.any(Function))
    const updater = patchThreadCaches.mock.calls[0][1] as (value: Thread) => Thread
    expect(updater(thread())).toMatchObject({ cachedPlan: null, cachedPlanMessageId: null })
    expect(revalidateThreadCaches).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith("Reply sent")
  })

  it("surfaces API failures without mutating caches", async () => {
    quickApprove.mockResolvedValue({ ok: false, error: "Plan expired." })
    const patchThreadCaches = vi.fn()
    const showToast = vi.fn()

    let latest: ReturnType<typeof useTicketListRowActions> | null = null
    function Harness() {
      latest = useTicketListRowActions({
        patchThreadCaches,
        revalidateThreadCaches: vi.fn(),
        showToast,
      })
      return null
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(React.createElement(Harness))
    })

    await act(async () => {
      await latest!.handleQuickApproveFromList("thread-send", "plan-1")
    })

    expect(patchThreadCaches).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith("Plan expired.", "error")
  })
})
