import { describe, expect, it, vi } from "vitest"
import { createThreadCacheCoordinator } from "./useThreadCacheCoordinator"
import type { Thread } from "@/types"

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-open",
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
    cachedPlanMessageId: null,
    cachedPlan: null,
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
    ...overrides,
  }
}

function createDeps(overrides: Partial<Parameters<typeof createThreadCacheCoordinator>[0]> = {}) {
  const streamThreads = overrides.streamThreads ?? [thread()]
  const filteredThreads = overrides.filteredThreads ?? []

  return {
    streamThreads,
    filteredThreads,
    activeThread: overrides.activeThread,
    streamIncludesClosed: overrides.streamIncludesClosed ?? false,
    mutateStream: vi.fn().mockResolvedValue(undefined),
    mutateFiltered: vi.fn().mockResolvedValue(undefined),
    removeFromStream: vi.fn().mockResolvedValue(undefined),
    removeFromFiltered: vi.fn().mockResolvedValue(undefined),
    prependToStream: vi.fn().mockResolvedValue(undefined),
    prependToFiltered: vi.fn().mockResolvedValue(undefined),
    mutateSearch: vi.fn().mockResolvedValue(undefined),
    mutateActiveThread: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe("createThreadCacheCoordinator", () => {
  it("patches stream, filtered, search, and active caches together", async () => {
    const deps = createDeps({
      streamThreads: [thread({ id: "a" })],
      filteredThreads: [thread({ id: "b", filterStatus: "filtered" })],
      activeThread: thread({ id: "a", subject: "Before" }),
    })
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.patchThreadCaches("a", current => ({ ...current, subject: "After" }))

    expect(deps.mutateStream).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "a", subject: "After" })],
      false,
    )
    expect(deps.mutateFiltered).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "b" })],
      false,
    )
    expect(deps.mutateSearch).toHaveBeenCalled()
    expect(deps.mutateActiveThread).toHaveBeenCalled()
  })

  it("removes closed threads from the open-only stream", async () => {
    const deps = createDeps({ streamThreads: [thread({ id: "a" })], streamIncludesClosed: false })
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.moveThreadStatus("a", "closed")

    expect(deps.removeFromStream).toHaveBeenCalledWith("a")
    expect(deps.mutateStream).not.toHaveBeenCalled()
  })

  it("keeps closed threads visible when the stream includes closed rows", async () => {
    const deps = createDeps({ streamThreads: [thread({ id: "a" })], streamIncludesClosed: true })
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.moveThreadStatus("a", "closed")

    expect(deps.removeFromStream).not.toHaveBeenCalled()
    expect(deps.mutateStream).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "a", status: "closed" })],
      false,
    )
  })

  it("moves a thread into the spam cache and off the main stream", async () => {
    const open = thread({ id: "a" })
    const deps = createDeps({ streamThreads: [open] })
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.moveThreadFilterStatus("a", "filtered", "confirmed_spam")

    expect(deps.removeFromStream).toHaveBeenCalledWith("a")
    expect(deps.prependToFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a",
        filterStatus: "filtered",
        filterFeedback: "confirmed_spam",
      }),
    )
  })

  it("restores a filtered thread to the main stream", async () => {
    const filtered = thread({ id: "a", filterStatus: "filtered" })
    const deps = createDeps({ streamThreads: [], filteredThreads: [filtered] })
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.moveThreadFilterStatus("a", "genuine")

    expect(deps.removeFromFiltered).toHaveBeenCalledWith("a")
    expect(deps.prependToStream).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", filterStatus: "genuine" }),
    )
  })

  it("revalidates every inbox cache on demand", async () => {
    const deps = createDeps()
    const coordinator = createThreadCacheCoordinator(deps)

    await coordinator.revalidateThreadCaches()

    expect(deps.mutateStream).toHaveBeenCalledWith()
    expect(deps.mutateFiltered).toHaveBeenCalledWith()
    expect(deps.mutateSearch).toHaveBeenCalledWith()
    expect(deps.mutateActiveThread).toHaveBeenCalledWith()
  })
})
