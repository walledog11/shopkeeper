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
    escalatedAt: null,
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
  stream = [],
  filtered = [],
  streamIncludesClosed = false,
  search,
  active,
}: {
  stream?: Thread[]
  filtered?: Thread[]
  streamIncludesClosed?: boolean
  search?: ThreadSearchData
  active?: ActiveThreadData
}) {
  let streamThreads = [...stream]
  let filteredThreads = [...filtered]
  let searchData = search
  let activeThreadData = active

  const mutateStream: CoordinatorDeps['mutateStream'] = vi.fn(async (next?: Thread[]) => {
    if (next) streamThreads = next
    return streamThreads
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

  const removeFromStream = vi.fn(async (id: string) => {
    streamThreads = streamThreads.filter(thread => thread.id !== id)
  })
  const removeFromFiltered = vi.fn(async (id: string) => {
    filteredThreads = filteredThreads.filter(thread => thread.id !== id)
  })
  const prependToStream = vi.fn(async (thread: Thread) => {
    streamThreads = [thread, ...streamThreads.filter(existing => existing.id !== thread.id)]
  })
  const prependToFiltered = vi.fn(async (thread: Thread) => {
    filteredThreads = [thread, ...filteredThreads.filter(existing => existing.id !== thread.id)]
  })

  const coordinator = createThreadCacheCoordinator({
    streamThreads,
    filteredThreads,
    activeThread: activeThreadData?.thread,
    streamIncludesClosed,
    mutateStream,
    mutateFiltered,
    removeFromStream,
    removeFromFiltered,
    prependToStream,
    prependToFiltered,
    mutateSearch,
    mutateActiveThread,
  })

  return {
    coordinator,
    get streamThreads() { return streamThreads },
    get filteredThreads() { return filteredThreads },
    get searchData() { return searchData },
    get activeThreadData() { return activeThreadData },
    removeFromStream,
    prependToStream,
    prependToFiltered,
  }
}

describe('createThreadCacheCoordinator', () => {
  it('patches stream, filtered, search, and active thread caches together', async () => {
    const thread = makeThread({ id: 'thread-1' })
    const harness = createHarness({
      stream: [thread],
      filtered: [thread],
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.patchThreadCaches('thread-1', current => ({
      ...current,
      aiSummary: 'Updated summary',
    }))

    expect(harness.streamThreads[0].aiSummary).toBe('Updated summary')
    expect(harness.filteredThreads[0].aiSummary).toBe('Updated summary')
    expect(harness.searchData?.threads[0].aiSummary).toBe('Updated summary')
    expect(harness.activeThreadData?.thread.aiSummary).toBe('Updated summary')
  })

  it('removes a closed thread from the stream when closed rows are hidden', async () => {
    const thread = makeThread({ id: 'thread-1', status: 'open' })
    const harness = createHarness({
      stream: [thread],
      streamIncludesClosed: false,
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.moveThreadStatus('thread-1', 'closed')

    expect(harness.streamThreads).toEqual([])
    expect(harness.removeFromStream).toHaveBeenCalledWith('thread-1')
    expect(harness.searchData?.threads).toMatchObject([{ id: 'thread-1', status: 'closed' }])
    expect(harness.activeThreadData?.thread).toMatchObject({ id: 'thread-1', status: 'closed' })
  })

  it('keeps a closed thread in the stream when closed rows are shown', async () => {
    const thread = makeThread({ id: 'thread-1', status: 'open' })
    const harness = createHarness({
      stream: [thread],
      streamIncludesClosed: true,
      search: { threads: [thread] },
      active: { thread },
    })

    await harness.coordinator.moveThreadStatus('thread-1', 'closed')

    expect(harness.streamThreads).toMatchObject([{ id: 'thread-1', status: 'closed' }])
    expect(harness.removeFromStream).not.toHaveBeenCalled()
    expect(harness.searchData?.threads).toMatchObject([{ id: 'thread-1', status: 'closed' }])
  })

  it('recovers a filtered thread back into the stream', async () => {
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
    expect(harness.streamThreads).toMatchObject([{
      id: 'thread-1',
      filterStatus: 'genuine',
      filterFeedback: 'confirmed_genuine',
    }])
    expect(harness.prependToStream).toHaveBeenCalled()
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
