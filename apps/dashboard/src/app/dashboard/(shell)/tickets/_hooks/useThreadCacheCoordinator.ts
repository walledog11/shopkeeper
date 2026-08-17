import { useMemo } from 'react'
import type { KeyedMutator } from 'swr'
import type { AgentTurnAction } from '@shopkeeper/agent/turns'
import type { Thread, ThreadFilterFeedback, ThreadFilterStatus } from '@/types'

type ThreadListMutate = (updater?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
type ThreadListUpdater = (thread: Thread) => Thread

export interface ThreadSearchData {
  threads: Thread[]
}

export interface ActiveThreadData {
  thread: Thread
  agentActionsByTurnId?: Record<string, AgentTurnAction[]>
}

/**
 * Two caches, not four: the stream (open, or open+closed when closed rows are
 * shown) and the filtered set behind the spam footer. A thread only ever moves
 * between those two — closing one leaves it in the stream when closed rows are
 * shown, which is the whole point of a list that never relocates a row.
 */
interface ThreadCacheCoordinatorDeps {
  streamThreads: Thread[]
  filteredThreads: Thread[]
  activeThread: Thread | undefined
  streamIncludesClosed: boolean
  mutateStream: ThreadListMutate
  mutateFiltered: ThreadListMutate
  removeFromStream: (id: string) => Promise<void>
  removeFromFiltered: (id: string) => Promise<void>
  prependToStream: (thread: Thread) => Promise<void>
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

function findThread(deps: ThreadCacheCoordinatorDeps, threadId: string) {
  return [...deps.streamThreads, ...deps.filteredThreads].find(thread => thread.id === threadId)
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

export function createThreadCacheCoordinator(deps: ThreadCacheCoordinatorDeps): ThreadCacheCoordinator {
  const patchAncillary = async (threadId: string, updateThread: ThreadListUpdater) => {
    await Promise.all([
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const patchThreadCaches = async (threadId: string, updateThread: ThreadListUpdater) => {
    await Promise.all([
      deps.mutateStream(patchThreads(deps.streamThreads, threadId, updateThread), false),
      deps.mutateFiltered(patchThreads(deps.filteredThreads, threadId, updateThread), false),
      patchAncillary(threadId, updateThread),
    ])
  }

  const moveThreadStatus = async (threadId: string, nextStatus: 'open' | 'closed') => {
    const updateThread = (thread: Thread) => ({ ...thread, status: nextStatus })
    const dropsOutOfStream = nextStatus === 'closed' && !deps.streamIncludesClosed

    await Promise.all([
      dropsOutOfStream
        ? deps.removeFromStream(threadId)
        : deps.mutateStream(patchThreads(deps.streamThreads, threadId, updateThread), false),
      patchAncillary(threadId, updateThread),
    ])
  }

  const moveThreadFilterStatus = async (
    threadId: string,
    nextFilterStatus: ThreadFilterStatus,
    nextFilterFeedback?: ThreadFilterFeedback,
  ) => {
    const existing = findThread(deps, threadId)
    if (!existing) return

    const updateThread = (thread: Thread) => ({
      ...thread,
      filterStatus: nextFilterStatus,
      filterFeedback: nextFilterFeedback ?? thread.filterFeedback,
    })
    const updated = updateThread(existing)
    const toFiltered = nextFilterStatus === 'filtered'
    const staysInStream = !toFiltered
      && (updated.status === 'open' || deps.streamIncludesClosed)

    await Promise.all([
      toFiltered ? deps.removeFromStream(threadId) : Promise.resolve(),
      toFiltered ? deps.prependToFiltered(updated) : deps.removeFromFiltered(threadId),
      staysInStream ? deps.prependToStream(updated) : Promise.resolve(),
      patchAncillary(threadId, updateThread),
    ])
  }

  const revalidateThreadCaches = async () => {
    await Promise.all([
      deps.mutateStream(),
      deps.mutateFiltered(),
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

export function useThreadCacheCoordinator(deps: ThreadCacheCoordinatorDeps): ThreadCacheCoordinator {
  const {
    streamThreads,
    filteredThreads,
    activeThread,
    streamIncludesClosed,
    mutateStream,
    mutateFiltered,
    removeFromStream,
    removeFromFiltered,
    prependToStream,
    prependToFiltered,
    mutateSearch,
    mutateActiveThread,
  } = deps

  return useMemo(
    () => createThreadCacheCoordinator({
      streamThreads,
      filteredThreads,
      activeThread,
      streamIncludesClosed,
      mutateStream,
      mutateFiltered,
      removeFromStream,
      removeFromFiltered,
      prependToStream,
      prependToFiltered,
      mutateSearch,
      mutateActiveThread,
    }),
    [
      activeThread,
      filteredThreads,
      mutateActiveThread,
      mutateFiltered,
      mutateSearch,
      mutateStream,
      prependToFiltered,
      prependToStream,
      removeFromFiltered,
      removeFromStream,
      streamIncludesClosed,
      streamThreads,
    ],
  )
}
