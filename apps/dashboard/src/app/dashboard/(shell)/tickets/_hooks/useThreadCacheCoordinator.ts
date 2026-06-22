import { useMemo } from 'react'
import type { KeyedMutator } from 'swr'
import type { AgentTurnAction } from '@shopkeeper/agent/turns'
import type { Thread, ThreadFilterFeedback, ThreadFilterStatus } from '@/types'

type ThreadListMutate = (updater?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
type ThreadListUpdater = (thread: Thread) => Thread
type ThreadListCacheKey = 'open' | 'allOpen' | 'closed' | 'filtered'

export interface ThreadSearchData {
  threads: Thread[]
}

export interface ActiveThreadData {
  thread: Thread
  agentActionsByTurnId?: Record<string, AgentTurnAction[]>
}

interface ThreadCacheCoordinatorDeps {
  openThreads: Thread[]
  allOpenThreads?: Thread[]
  closedThreads: Thread[]
  filteredThreads: Thread[]
  activeThread: Thread | undefined
  mutateOpen: ThreadListMutate
  mutateAllOpen?: ThreadListMutate
  mutateClosed: ThreadListMutate
  mutateFiltered: ThreadListMutate
  removeFromOpen: (id: string) => Promise<void>
  removeFromAllOpen?: (id: string) => Promise<void>
  removeFromClosed: (id: string) => Promise<void>
  removeFromFiltered: (id: string) => Promise<void>
  prependToOpen: (thread: Thread) => Promise<void>
  prependToAllOpen?: (thread: Thread) => Promise<void>
  prependToClosed: (thread: Thread) => Promise<void>
  prependToFiltered: (thread: Thread) => Promise<void>
  mutateSearch: KeyedMutator<ThreadSearchData>
  mutateActiveThread: KeyedMutator<ActiveThreadData>
}

export interface ThreadCacheCoordinator {
  patchThreadCaches: (threadId: string, updateThread: ThreadListUpdater) => Promise<void>
  moveThreadStatus: (threadId: string, nextStatus: 'open' | 'closed') => Promise<void>
  moveThreadFilterStatus: (
    threadId: string,
    nextFilterStatus: ThreadFilterStatus,
    nextFilterFeedback?: ThreadFilterFeedback,
  ) => Promise<void>
  revalidateThreadCaches: () => Promise<void>
}

function patchThreads(threads: Thread[], threadId: string, updateThread: ThreadListUpdater) {
  return threads.map(thread => thread.id === threadId ? updateThread(thread) : thread)
}

interface ThreadListCacheEntry {
  key: ThreadListCacheKey
  threads: Thread[]
  mutate: ThreadListMutate
  removeThreadById: (id: string) => Promise<void>
  prependThread: (thread: Thread) => Promise<void>
}

interface CacheMovePolicy {
  patch: ThreadListCacheKey[]
  prepend: ThreadListCacheKey[]
  remove: ThreadListCacheKey[]
}

const STATUS_MOVE_POLICIES: Record<'open' | 'closed' | 'filtered', CacheMovePolicy> = {
  filtered: {
    patch: ['filtered'],
    prepend: [],
    remove: ['open', 'allOpen', 'closed'],
  },
  closed: {
    patch: [],
    prepend: ['closed'],
    remove: ['open', 'allOpen', 'filtered'],
  },
  open: {
    patch: [],
    prepend: ['open', 'allOpen'],
    remove: ['closed', 'filtered'],
  },
}

const FILTER_MOVE_POLICIES: Record<'open' | 'closed' | 'filtered', CacheMovePolicy> = {
  filtered: {
    patch: [],
    prepend: ['filtered'],
    remove: ['open', 'allOpen', 'closed'],
  },
  closed: {
    patch: [],
    prepend: ['closed'],
    remove: ['open', 'allOpen', 'filtered'],
  },
  open: {
    patch: [],
    prepend: ['open', 'allOpen'],
    remove: ['closed', 'filtered'],
  },
}

function createListCacheRegistry(deps: ThreadCacheCoordinatorDeps): ThreadListCacheEntry[] {
  const entries: ThreadListCacheEntry[] = [
    {
      key: 'open',
      threads: deps.openThreads,
      mutate: deps.mutateOpen,
      removeThreadById: deps.removeFromOpen,
      prependThread: deps.prependToOpen,
    },
    {
      key: 'closed',
      threads: deps.closedThreads,
      mutate: deps.mutateClosed,
      removeThreadById: deps.removeFromClosed,
      prependThread: deps.prependToClosed,
    },
    {
      key: 'filtered',
      threads: deps.filteredThreads,
      mutate: deps.mutateFiltered,
      removeThreadById: deps.removeFromFiltered,
      prependThread: deps.prependToFiltered,
    },
  ]

  if (deps.allOpenThreads && deps.mutateAllOpen && deps.removeFromAllOpen && deps.prependToAllOpen) {
    entries.splice(1, 0, {
      key: 'allOpen',
      threads: deps.allOpenThreads,
      mutate: deps.mutateAllOpen,
      removeThreadById: deps.removeFromAllOpen,
      prependThread: deps.prependToAllOpen,
    })
  }

  return entries
}

function listCacheMap(entries: ThreadListCacheEntry[]) {
  return new Map(entries.map(entry => [entry.key, entry]))
}

function findThread(deps: ThreadCacheCoordinatorDeps, threadId: string) {
  return createListCacheRegistry(deps)
    .flatMap(entry => entry.threads)
    .find(thread => thread.id === threadId)
    ?? (deps.activeThread?.id === threadId ? deps.activeThread : undefined)
}

async function patchSearchCache(
  mutateSearch: KeyedMutator<ThreadSearchData>,
  threadId: string,
  updateThread: ThreadListUpdater,
) {
  await mutateSearch(
    current => current
      ? { ...current, threads: patchThreads(current.threads, threadId, updateThread) }
      : current,
    { revalidate: false },
  )
}

async function patchActiveThreadCache(
  mutateActiveThread: KeyedMutator<ActiveThreadData>,
  threadId: string,
  updateThread: ThreadListUpdater,
) {
  await mutateActiveThread(
    current => current?.thread.id === threadId
      ? { ...current, thread: updateThread(current.thread) }
      : current,
    { revalidate: false },
  )
}

async function applyListCacheMove(input: {
  entriesByKey: Map<ThreadListCacheKey, ThreadListCacheEntry>
  policy: CacheMovePolicy
  threadId: string
  updated: Thread
  updateThread: ThreadListUpdater
}) {
  const { entriesByKey, policy, threadId, updated, updateThread } = input
  const operations: Promise<unknown>[] = []

  for (const key of policy.remove) {
    operations.push(entriesByKey.get(key)?.removeThreadById(threadId) ?? Promise.resolve())
  }
  for (const key of policy.prepend) {
    operations.push(entriesByKey.get(key)?.prependThread(updated) ?? Promise.resolve())
  }
  for (const key of policy.patch) {
    const entry = entriesByKey.get(key)
    if (entry) operations.push(entry.mutate(patchThreads(entry.threads, threadId, updateThread), false))
  }

  await Promise.all(operations)
}

function listDestinationFor(thread: Thread): 'open' | 'closed' | 'filtered' {
  if (thread.filterStatus === 'filtered') return 'filtered'
  return thread.status === 'closed' ? 'closed' : 'open'
}

export function createThreadCacheCoordinator(deps: ThreadCacheCoordinatorDeps): ThreadCacheCoordinator {
  const listCaches = createListCacheRegistry(deps)
  const listCachesByKey = listCacheMap(listCaches)

  const patchThreadCaches = async (threadId: string, updateThread: ThreadListUpdater) => {
    await Promise.all([
      ...listCaches.map(entry => entry.mutate(patchThreads(entry.threads, threadId, updateThread), false)),
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const moveThreadStatus = async (threadId: string, nextStatus: 'open' | 'closed') => {
    const existing = findThread(deps, threadId)
    if (!existing) return

    const updated: Thread = { ...existing, status: nextStatus }
    const updateThread = (thread: Thread) => ({ ...thread, status: nextStatus })
    const destination = listDestinationFor(updated)
    await applyListCacheMove({
      entriesByKey: listCachesByKey,
      policy: STATUS_MOVE_POLICIES[destination],
      threadId,
      updated,
      updateThread,
    })

    await Promise.all([
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const moveThreadFilterStatus = async (
    threadId: string,
    nextFilterStatus: ThreadFilterStatus,
    nextFilterFeedback?: ThreadFilterFeedback,
  ) => {
    const existing = findThread(deps, threadId)
    if (!existing) return

    const updated: Thread = {
      ...existing,
      filterStatus: nextFilterStatus,
      filterFeedback: nextFilterFeedback ?? existing.filterFeedback,
    }
    const updateThread = (thread: Thread) => ({
      ...thread,
      filterStatus: nextFilterStatus,
      filterFeedback: nextFilterFeedback ?? thread.filterFeedback,
    })
    const destination = listDestinationFor(updated)
    await applyListCacheMove({
      entriesByKey: listCachesByKey,
      policy: FILTER_MOVE_POLICIES[destination],
      threadId,
      updated,
      updateThread,
    })

    await Promise.all([
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const revalidateThreadCaches = async () => {
    await Promise.all([
      ...listCaches.map(entry => entry.mutate()),
      deps.mutateSearch(),
      deps.mutateActiveThread(),
    ])
  }

  return {
    patchThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    revalidateThreadCaches,
  }
}

export function useThreadCacheCoordinator({
  openThreads,
  allOpenThreads,
  closedThreads,
  filteredThreads,
  activeThread,
  mutateOpen,
  mutateAllOpen,
  mutateClosed,
  mutateFiltered,
  removeFromOpen,
  removeFromAllOpen,
  removeFromClosed,
  removeFromFiltered,
  prependToOpen,
  prependToAllOpen,
  prependToClosed,
  prependToFiltered,
  mutateSearch,
  mutateActiveThread,
}: ThreadCacheCoordinatorDeps): ThreadCacheCoordinator {
  return useMemo(
    () => createThreadCacheCoordinator({
      openThreads,
      allOpenThreads,
      closedThreads,
      filteredThreads,
      activeThread,
      mutateOpen,
      mutateAllOpen,
      mutateClosed,
      mutateFiltered,
      removeFromOpen,
      removeFromAllOpen,
      removeFromClosed,
      removeFromFiltered,
      prependToOpen,
      prependToAllOpen,
      prependToClosed,
      prependToFiltered,
      mutateSearch,
      mutateActiveThread,
    }),
    [
      activeThread,
      allOpenThreads,
      closedThreads,
      filteredThreads,
      mutateActiveThread,
      mutateAllOpen,
      mutateClosed,
      mutateFiltered,
      mutateOpen,
      mutateSearch,
      openThreads,
      prependToAllOpen,
      prependToClosed,
      prependToFiltered,
      prependToOpen,
      removeFromAllOpen,
      removeFromClosed,
      removeFromFiltered,
      removeFromOpen,
    ],
  )
}
