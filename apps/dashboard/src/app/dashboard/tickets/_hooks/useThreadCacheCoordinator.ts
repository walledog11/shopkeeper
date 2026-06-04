import { useCallback } from 'react'
import type { KeyedMutator } from 'swr'
import type { AgentTurnAction } from '@/lib/agent/api/turns'
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

interface ThreadCacheCoordinatorDeps {
  openThreads: Thread[]
  closedThreads: Thread[]
  filteredThreads: Thread[]
  activeThread: Thread | undefined
  mutateOpen: ThreadListMutate
  mutateClosed: ThreadListMutate
  mutateFiltered: ThreadListMutate
  removeFromOpen: (id: string) => Promise<void>
  removeFromClosed: (id: string) => Promise<void>
  removeFromFiltered: (id: string) => Promise<void>
  prependToOpen: (thread: Thread) => Promise<void>
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

function findThread(deps: ThreadCacheCoordinatorDeps, threadId: string) {
  return deps.openThreads.find(thread => thread.id === threadId)
    ?? deps.closedThreads.find(thread => thread.id === threadId)
    ?? deps.filteredThreads.find(thread => thread.id === threadId)
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
  const patchThreadCaches = async (threadId: string, updateThread: ThreadListUpdater) => {
    await Promise.all([
      deps.mutateOpen(patchThreads(deps.openThreads, threadId, updateThread), false),
      deps.mutateClosed(patchThreads(deps.closedThreads, threadId, updateThread), false),
      deps.mutateFiltered(patchThreads(deps.filteredThreads, threadId, updateThread), false),
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const moveThreadStatus = async (threadId: string, nextStatus: 'open' | 'closed') => {
    const existing = findThread(deps, threadId)
    if (!existing) return

    const updated: Thread = { ...existing, status: nextStatus }
    const updateThread = (thread: Thread) => ({ ...thread, status: nextStatus })

    if (updated.filterStatus === 'filtered') {
      await Promise.all([
        deps.removeFromOpen(threadId),
        deps.removeFromClosed(threadId),
        deps.mutateFiltered(patchThreads(deps.filteredThreads, threadId, updateThread), false),
      ])
    } else if (nextStatus === 'closed') {
      await Promise.all([
        deps.removeFromOpen(threadId),
        deps.removeFromFiltered(threadId),
        deps.prependToClosed(updated),
      ])
    } else {
      await Promise.all([
        deps.removeFromClosed(threadId),
        deps.removeFromFiltered(threadId),
        deps.prependToOpen(updated),
      ])
    }

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

    if (nextFilterStatus === 'filtered') {
      await Promise.all([
        deps.removeFromOpen(threadId),
        deps.removeFromClosed(threadId),
        deps.prependToFiltered(updated),
      ])
    } else if (updated.status === 'closed') {
      await Promise.all([
        deps.removeFromFiltered(threadId),
        deps.removeFromOpen(threadId),
        deps.prependToClosed(updated),
      ])
    } else {
      await Promise.all([
        deps.removeFromFiltered(threadId),
        deps.removeFromClosed(threadId),
        deps.prependToOpen(updated),
      ])
    }

    await Promise.all([
      patchSearchCache(deps.mutateSearch, threadId, updateThread),
      patchActiveThreadCache(deps.mutateActiveThread, threadId, updateThread),
    ])
  }

  const revalidateThreadCaches = async () => {
    await Promise.all([
      deps.mutateOpen(),
      deps.mutateClosed(),
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

export function useThreadCacheCoordinator({
  openThreads,
  closedThreads,
  filteredThreads,
  activeThread,
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
}: ThreadCacheCoordinatorDeps): ThreadCacheCoordinator {
  const patchThreadCaches = useCallback(
    (threadId: string, updateThread: ThreadListUpdater) =>
      createThreadCacheCoordinator({
        openThreads,
        closedThreads,
        filteredThreads,
        activeThread,
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
      }).patchThreadCaches(threadId, updateThread),
    [
      activeThread,
      closedThreads,
      filteredThreads,
      mutateActiveThread,
      mutateClosed,
      mutateFiltered,
      mutateOpen,
      mutateSearch,
      openThreads,
      prependToClosed,
      prependToFiltered,
      prependToOpen,
      removeFromClosed,
      removeFromFiltered,
      removeFromOpen,
    ],
  )
  const moveThreadStatus = useCallback(
    (threadId: string, nextStatus: 'open' | 'closed') =>
      createThreadCacheCoordinator({
        openThreads,
        closedThreads,
        filteredThreads,
        activeThread,
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
      }).moveThreadStatus(threadId, nextStatus),
    [
      activeThread,
      closedThreads,
      filteredThreads,
      mutateActiveThread,
      mutateClosed,
      mutateFiltered,
      mutateOpen,
      mutateSearch,
      openThreads,
      prependToClosed,
      prependToFiltered,
      prependToOpen,
      removeFromClosed,
      removeFromFiltered,
      removeFromOpen,
    ],
  )
  const moveThreadFilterStatus = useCallback(
    (threadId: string, nextFilterStatus: ThreadFilterStatus, nextFilterFeedback?: ThreadFilterFeedback) =>
      createThreadCacheCoordinator({
        openThreads,
        closedThreads,
        filteredThreads,
        activeThread,
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
      }).moveThreadFilterStatus(threadId, nextFilterStatus, nextFilterFeedback),
    [
      activeThread,
      closedThreads,
      filteredThreads,
      mutateActiveThread,
      mutateClosed,
      mutateFiltered,
      mutateOpen,
      mutateSearch,
      openThreads,
      prependToClosed,
      prependToFiltered,
      prependToOpen,
      removeFromClosed,
      removeFromFiltered,
      removeFromOpen,
    ],
  )
  const revalidateThreadCaches = useCallback(
    () => createThreadCacheCoordinator({
      openThreads,
      closedThreads,
      filteredThreads,
      activeThread,
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
    }).revalidateThreadCaches(),
    [
      activeThread,
      closedThreads,
      filteredThreads,
      mutateActiveThread,
      mutateClosed,
      mutateFiltered,
      mutateOpen,
      mutateSearch,
      openThreads,
      prependToClosed,
      prependToFiltered,
      prependToOpen,
      removeFromClosed,
      removeFromFiltered,
      removeFromOpen,
    ],
  )

  return {
    patchThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    revalidateThreadCaches,
  }
}
