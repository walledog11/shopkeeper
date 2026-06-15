import { describe, expect, it, vi } from 'vitest'
import { createThreadCacheCoordinator } from './useThreadCacheCoordinator'
import type { ActiveThreadData, ThreadSearchData } from './useThreadCacheCoordinator'
import type { Thread } from '@/types'

type CoordinatorDeps = Parameters<typeof createThreadCacheCoordinator>[0]

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  const { id, ...rest } = overrides
  const now = '2026-06-03T12:00:00.000Z'
  return {
    id,
    organizationId: 'org-1',
    customerId: `customer-${id}`,
    channelType: 'email',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    aiSummary: null,
    subject: 'Order question',
    tag: null,
    shopifyCustomerId: null,
    cachedPlanMessageId: null,
    cachedPlan: null,
    filterStatus: 'genuine',
    filterReason: null,
    filterFeedback: 'none',
    customer: {
      id: `customer-${id}`,
      organizationId: 'org-1',
      name: 'Ada Lovelace',
      platformId: 'ada@example.com',
      profilePicUrl: null,
      createdAt: now,
    },
    messages: [],
    ...rest,
  }
}

function createHarness({
  open = [],
  closed = [],
  filtered = [],
  search,
  active,
}: {
  open?: Thread[]
  closed?: Thread[]
  filtered?: Thread[]
  search?: ThreadSearchData
  active?: ActiveThreadData
}) {
  let openThreads = [...open]
  let closedThreads = [...closed]
  let filteredThreads = [...filtered]
  let searchData = search
  let activeThreadData = active

  const mutateOpen: CoordinatorDeps['mutateOpen'] = vi.fn(async (next?: Thread[]) => {
    if (next) openThreads = next
    return openThreads
  })
  const mutateClosed: CoordinatorDeps['mutateClosed'] = vi.fn(async (next?: Thread[]) => {
    if (next) closedThreads = next
    return closedThreads
  })
  const mutateFiltered: CoordinatorDeps['mutateFiltered'] = vi.fn(async (next?: Thread[]) => {
    if (next) filteredThreads = next
    return filteredThreads
  })
  const mutateSearch: CoordinatorDeps['mutateSearch'] = vi.fn(async (next?: unknown) => {
    if (typeof next === 'function') {
      searchData = await (next as (
        current?: ThreadSearchData,
      ) => ThreadSearchData | Promise<ThreadSearchData | undefined> | undefined)(searchData)
    } else if (next !== undefined) {
      searchData = await next as ThreadSearchData
    }
    return searchData
  }) as CoordinatorDeps['mutateSearch']
  const mutateActiveThread: CoordinatorDeps['mutateActiveThread'] = vi.fn(async (next?: unknown) => {
    if (typeof next === 'function') {
      activeThreadData = await (next as (
        current?: ActiveThreadData,
      ) => ActiveThreadData | Promise<ActiveThreadData | undefined> | undefined)(activeThreadData)
    } else if (next !== undefined) {
      activeThreadData = await next as ActiveThreadData
    }
    return activeThreadData
  }) as CoordinatorDeps['mutateActiveThread']

  const removeFromOpen = vi.fn(async (id: string) => {
    openThreads = openThreads.filter(thread => thread.id !== id)
  })
  const removeFromClosed = vi.fn(async (id: string) => {
    closedThreads = closedThreads.filter(thread => thread.id !== id)
  })
  const removeFromFiltered = vi.fn(async (id: string) => {
    filteredThreads = filteredThreads.filter(thread => thread.id !== id)
  })
  const prependToOpen = vi.fn(async (thread: Thread) => {
    openThreads = [thread, ...openThreads.filter(existing => existing.id !== thread.id)]
  })
  const prependToClosed = vi.fn(async (thread: Thread) => {
    closedThreads = [thread, ...closedThreads.filter(existing => existing.id !== thread.id)]
  })
  const prependToFiltered = vi.fn(async (thread: Thread) => {
    filteredThreads = [thread, ...filteredThreads.filter(existing => existing.id !== thread.id)]
  })

  const coordinator = createThreadCacheCoordinator({
    openThreads,
    closedThreads,
    filteredThreads,
    activeThread: activeThreadData?.thread,
    mutateOpen,
    mutateClosed,
    mutateFiltered,
    removeFromOpen,
    removeFromClosed,
    removeFromFiltered,
    prependToOpen,
    prependToClosed,
    prependToFiltered,
    mutateSearch,
    mutateActiveThread,
  })

  return {
    coordinator,
    get openThreads() { return openThreads },
    get closedThreads() { return closedThreads },
    get filteredThreads() { return filteredThreads },
    get searchData() { return searchData },
    get activeThreadData() { return activeThreadData },
  }
}

describe('createThreadCacheCoordinator', () => {
  it('patches list, search, and active thread caches together', async () => {
    const thread = makeThread({ id: 'thread-1' })
    const harness = createHarness({
      open: [thread],
      closed: [thread],
      filtered: [thread],
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.patchThreadCaches('thread-1', current => ({
      ...current,
      aiSummary: 'Updated summary',
    }))

    expect(harness.openThreads[0].aiSummary).toBe('Updated summary')
    expect(harness.closedThreads[0].aiSummary).toBe('Updated summary')
    expect(harness.filteredThreads[0].aiSummary).toBe('Updated summary')
    expect(harness.searchData?.threads[0].aiSummary).toBe('Updated summary')
    expect(harness.activeThreadData?.thread.aiSummary).toBe('Updated summary')
  })

  it('moves an open thread into the closed cache and patches search and active caches', async () => {
    const thread = makeThread({ id: 'thread-1', status: 'open' })
    const harness = createHarness({
      open: [thread],
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.moveThreadStatus('thread-1', 'closed')

    expect(harness.openThreads).toEqual([])
    expect(harness.closedThreads).toMatchObject([{ id: 'thread-1', status: 'closed' }])
    expect(harness.filteredThreads).toEqual([])
    expect(harness.searchData?.threads).toMatchObject([{ id: 'thread-1', status: 'closed' }])
    expect(harness.activeThreadData?.thread).toMatchObject({ id: 'thread-1', status: 'closed' })
  })

  it('moves a closed thread back into the open cache and patches search and active caches', async () => {
    const thread = makeThread({ id: 'thread-1', status: 'closed' })
    const harness = createHarness({
      closed: [thread],
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.moveThreadStatus('thread-1', 'open')

    expect(harness.closedThreads).toEqual([])
    expect(harness.openThreads).toMatchObject([{ id: 'thread-1', status: 'open' }])
    expect(harness.filteredThreads).toEqual([])
    expect(harness.searchData?.threads).toMatchObject([{ id: 'thread-1', status: 'open' }])
    expect(harness.activeThreadData?.thread).toMatchObject({ id: 'thread-1', status: 'open' })
  })

  it('recovers a filtered thread into the matching status cache', async () => {
    const thread = makeThread({
      id: 'thread-1',
      status: 'open',
      filterStatus: 'filtered',
      filterFeedback: 'confirmed_spam',
    })
    const harness = createHarness({
      filtered: [thread],
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.moveThreadFilterStatus('thread-1', 'genuine', 'confirmed_genuine')

    expect(harness.filteredThreads).toEqual([])
    expect(harness.openThreads).toMatchObject([{
      id: 'thread-1',
      filterStatus: 'genuine',
      filterFeedback: 'confirmed_genuine',
    }])
    expect(harness.searchData?.threads).toMatchObject([{
      id: 'thread-1',
      filterStatus: 'genuine',
      filterFeedback: 'confirmed_genuine',
    }])
    expect(harness.activeThreadData?.thread).toMatchObject({
      id: 'thread-1',
      filterStatus: 'genuine',
      filterFeedback: 'confirmed_genuine',
    })
  })
})
