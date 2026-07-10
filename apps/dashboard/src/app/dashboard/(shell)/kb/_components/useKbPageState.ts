"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { resolveEffectiveMemoryArticles } from "@shopkeeper/agent/kb-memory"
import { errorMessageFromUnknown, fetcher } from "@/lib/api/fetcher"
import type { KnowledgeBase, SampleReply, VoiceProposal } from "@/types"
import type { ContextCategory } from "@/lib/memory/context"
import { createContext, deleteArticle, updateArticle } from "./kb-page-requests"
import {
  collectMemoryTopicFilters,
  filterMemoryArticles,
  memoryArticleTopic,
  type MemorySourceFilter,
  type MemoryTopicFilter,
} from "./memory-page-utils"
import { type ArticleWithBase, type SortKey } from "./kb-page-utils"

const STORE_PROFILE_ID = "store-profile"
const emptyArticleDraft = (): { body: string; category: ContextCategory } => ({ body: "", category: "auto" })
const emptyEditDraft = () => ({ title: "", body: "" })

interface KbApiResponse {
  knowledgeBases: KnowledgeBase[]
  storeProfile: {
    name: string
    aiContext: string
    brandVoice: string
    sampleReplies: SampleReply[]
    voiceProposal: VoiceProposal | null
  }
}

export function useKbPageState() {
  const { data, isLoading, mutate } = useSWR<KbApiResponse>("/api/kb", fetcher)
  const knowledgeBases = useMemo(() => data?.knowledgeBases ?? [], [data])
  const storeProfile = data?.storeProfile ?? { name: "", aiContext: "", brandVoice: "", sampleReplies: [], voiceProposal: null }
  const hasShopifyConnection = knowledgeBases.some(kb => kb.source === "shopify")

  const [profileOpen, setProfileOpen] = useState(false)
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null)
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>("recent")
  const [sourceFilter, setSourceFilter] = useState<MemorySourceFilter>("all")
  const [topicFilter, setTopicFilter] = useState<MemoryTopicFilter>("all")
  const [search, setSearch] = useState("")
  const [isCreatingArticle, setIsCreatingArticle] = useState(false)
  const [correctionTargetId, setCorrectionTargetId] = useState<string | null>(null)
  const [articleDraft, setArticleDraft] = useState(emptyArticleDraft)
  const [isArticleSaving, setIsArticleSaving] = useState(false)
  const [articleCreateError, setArticleCreateError] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState(emptyEditDraft)
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isArticleDeleting, setIsArticleDeleting] = useState(false)
  const [articleDeleteError, setArticleDeleteError] = useState<string | null>(null)
  const [voiceProposalBusy, setVoiceProposalBusy] = useState<null | "approve" | "dismiss">(null)
  const [voiceProposalError, setVoiceProposalError] = useState<string | null>(null)

  const rawArticles: ArticleWithBase[] = useMemo(() => knowledgeBases.flatMap(kb =>
    kb.articles.map(article => ({ ...article, baseName: kb.name, baseSource: kb.source })),
  ), [knowledgeBases])
  const allArticles = useMemo(() => resolveEffectiveMemoryArticles(rawArticles), [rawArticles])
  const visibleArticles = useMemo(() => {
    const sorted = [...filterMemoryArticles(allArticles, sourceFilter, topicFilter, search)]
    if (sort === "recent") sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    else sorted.sort((a, b) => a.title.localeCompare(b.title))
    return sorted
  }, [allArticles, search, sort, sourceFilter, topicFilter])
  const topicFilters = useMemo(() => collectMemoryTopicFilters(allArticles), [allArticles])
  const expandedArticle = expandedArticleId ? allArticles.find(article => article.id === expandedArticleId) ?? null : null
  const selectedArticle = editingArticleId ? allArticles.find(article => article.id === editingArticleId) ?? null : null
  const correctionTarget = correctionTargetId ? allArticles.find(article => article.id === correctionTargetId) ?? null : null

  const closeArticleOverlay = () => {
    setExpandedArticleId(null)
    setEditingArticleId(null)
    setEditError(null)
    setArticleDeleteError(null)
  }
  const expandArticle = (id: string) => {
    closeArticleOverlay()
    setProfileOpen(false)
    setExpandedArticleId(id)
  }
  const selectStoreProfile = () => {
    closeArticleOverlay()
    setProfileOpen(true)
  }
  const closeStoreProfile = () => setProfileOpen(false)
  const beginAddContext = () => {
    setCorrectionTargetId(null)
    setArticleDraft(emptyArticleDraft())
    setArticleCreateError(null)
    setIsCreatingArticle(true)
  }
  const beginCorrection = () => {
    if (!expandedArticle) return
    setCorrectionTargetId(expandedArticle.id)
    setArticleDraft({ body: "", category: memoryArticleTopic(expandedArticle) as ContextCategory })
    setExpandedArticleId(null)
    setIsCreatingArticle(true)
  }
  const closeContextComposer = () => {
    setIsCreatingArticle(false)
    setCorrectionTargetId(null)
    setArticleDraft(emptyArticleDraft())
    setArticleCreateError(null)
  }
  const handleCreateArticle = async () => {
    if (!articleDraft.body.trim()) return
    setIsArticleSaving(true)
    setArticleCreateError(null)
    try {
      await createContext(articleDraft.body, articleDraft.category, correctionTargetId ?? undefined)
      await mutate()
      closeContextComposer()
    } catch (error) {
      setArticleCreateError(errorMessageFromUnknown(error, "Failed to add context."))
    } finally {
      setIsArticleSaving(false)
    }
  }
  const startEdit = () => {
    if (!expandedArticle) return
    setEditDraft({ title: expandedArticle.title, body: expandedArticle.body })
    setEditingArticleId(expandedArticle.id)
    setExpandedArticleId(null)
    setEditError(null)
  }
  const handleUpdateArticle = async () => {
    if (!selectedArticle) return
    setIsEditSaving(true)
    setEditError(null)
    try {
      await updateArticle(selectedArticle.id, { title: editDraft.title, body: editDraft.body, tags: selectedArticle.tags })
      await mutate()
      closeArticleOverlay()
    } catch (error) {
      setEditError(errorMessageFromUnknown(error, "Failed to update note."))
    } finally {
      setIsEditSaving(false)
    }
  }
  const handleDeleteArticle = async () => {
    const id = expandedArticleId ?? editingArticleId
    if (!id) return
    setIsArticleDeleting(true)
    setArticleDeleteError(null)
    try {
      await deleteArticle(id)
      closeArticleOverlay()
      await mutate()
    } catch (error) {
      setArticleDeleteError(errorMessageFromUnknown(error, "Failed to delete note."))
    } finally {
      setIsArticleDeleting(false)
    }
  }
  const handleSaveStoreProfile = async (input: { aiContext: string; brandVoice: string; sampleReplies: SampleReply[] }) => {
    const response = await fetch("/api/org", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: input }) })
    if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Failed to save store profile.")
    await mutate()
  }
  const handleResolveVoiceProposal = async (action: "approve" | "dismiss") => {
    setVoiceProposalBusy(action)
    setVoiceProposalError(null)
    try {
      const response = await fetch("/api/agent/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      if (!response.ok) throw new Error("Failed to update reply style suggestion.")
      await mutate()
    } catch (error) {
      setVoiceProposalError(errorMessageFromUnknown(error, "Failed to update reply style suggestion."))
    } finally {
      setVoiceProposalBusy(null)
    }
  }

  return {
    articleCreateError, articleDeleteError, articleDraft, beginAddContext, beginCorrection,
    closeArticleOverlay, closeContextComposer, closeStoreProfile, correctionTarget, editDraft, editError,
    expandedArticle, expandArticle, handleCreateArticle, handleDeleteArticle, handleSaveStoreProfile,
    handleResolveVoiceProposal, handleUpdateArticle, hasShopifyConnection, isArticleDeleting,
    isArticleSaving, isCreatingArticle, isEditSaving, isLoading, isStoreProfileOpen: profileOpen,
    search, selectStoreProfile, selectedArticle, setArticleDraft, setEditDraft, setSearch, setSort,
    setSourceFilter, setTopicFilter, sort, sourceFilter, startEdit, storeProfile, topicFilter,
    topicFilters, visibleArticles, voiceProposalBusy, voiceProposalError,
  }
}

export type KbPageState = ReturnType<typeof useKbPageState>
