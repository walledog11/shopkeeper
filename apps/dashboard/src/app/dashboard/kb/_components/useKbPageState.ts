"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { errorMessageFromUnknown, fetcher } from "@/lib/api/fetcher"
import type { KnowledgeBase } from "@/types"
import {
  createArticle,
  createKnowledgeBase,
  deleteArticle,
  deleteKnowledgeBase,
  updateArticle,
} from "./kb-page-requests"
import { parseTags, type ArticleWithBase, type MobileView, type SortKey } from "./kb-page-utils"

const emptyArticleDraft = () => ({ title: "", body: "", tags: "" })

export function useKbPageState() {
  const { data, isLoading, mutate } = useSWR<{ knowledgeBases: KnowledgeBase[] }>("/api/kb", fetcher)
  const knowledgeBases = useMemo(() => data?.knowledgeBases ?? [], [data])

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedBaseId, setSelectedBaseId] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("recent")
  const [mobileView, setMobileView] = useState<MobileView>("list")

  const [isCreatingKb, setIsCreatingKb] = useState(false)
  const [newKbName, setNewKbName] = useState("")
  const [isCreatingKbSaving, setIsCreatingKbSaving] = useState(false)
  const [kbActionError, setKbActionError] = useState<string | null>(null)

  const [isCreatingArticle, setIsCreatingArticle] = useState(false)
  const [articleDraft, setArticleDraft] = useState(emptyArticleDraft)
  const [isArticleSaving, setIsArticleSaving] = useState(false)
  const [articleCreateError, setArticleCreateError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(emptyArticleDraft)
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isArticleDeleting, setIsArticleDeleting] = useState(false)
  const [articleDeleteError, setArticleDeleteError] = useState<string | null>(null)

  const userKbs = knowledgeBases.filter(kb => kb.source === "user")
  const articleTargetKb = selectedBaseId === "all"
    ? userKbs[0]
    : userKbs.find(kb => kb.id === selectedBaseId)

  const allArticles: ArticleWithBase[] = useMemo(() => {
    return knowledgeBases.flatMap(kb =>
      kb.articles.map(a => ({ ...a, baseName: kb.name, baseSource: kb.source }))
    )
  }, [knowledgeBases])

  const visibleArticles = useMemo(() => {
    let list = allArticles
    if (selectedBaseId !== "all") {
      list = list.filter(a => a.knowledgeBaseId === selectedBaseId)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === "recent") {
      sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title))
    }
    return sorted
  }, [allArticles, selectedBaseId, search, sort])

  const selectedArticle = useMemo(() => {
    if (!selectedArticleId) return null
    return allArticles.find(a => a.id === selectedArticleId) ?? null
  }, [allArticles, selectedArticleId])

  const selectArticle = (id: string | null) => {
    setSelectedArticleId(id)
    setIsEditing(false)
    setEditError(null)
    setArticleDeleteError(null)
    setMobileView(id ? "detail" : "list")
  }

  const selectBase = (id: string) => {
    setSelectedBaseId(id)
    setSelectedArticleId(null)
    setIsCreatingArticle(false)
    setIsEditing(false)
    setArticleCreateError(null)
    setEditError(null)
    setArticleDeleteError(null)
    setMobileView("list")
  }

  const handleCreateKb = async () => {
    if (!newKbName.trim()) return
    setIsCreatingKbSaving(true)
    setKbActionError(null)
    try {
      const json = await createKnowledgeBase(newKbName.trim())
      await mutate()
      setIsCreatingKb(false)
      setNewKbName("")
      if (json.knowledgeBase.id) selectBase(json.knowledgeBase.id)
    } catch (error) {
      setKbActionError(errorMessageFromUnknown(error, "Failed to create collection."))
    } finally {
      setIsCreatingKbSaving(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    setKbActionError(null)
    try {
      await deleteKnowledgeBase(id)
      if (selectedBaseId === id) selectBase("all")
      else if (selectedArticle?.knowledgeBaseId === id) selectArticle(null)
      await mutate()
    } catch (error) {
      setKbActionError(errorMessageFromUnknown(error, "Failed to delete collection."))
    }
  }

  const handleCreateArticle = async () => {
    if (!articleTargetKb || !articleDraft.title.trim() || !articleDraft.body.trim()) return
    setIsArticleSaving(true)
    setArticleCreateError(null)
    try {
      const json = await createArticle(articleTargetKb.id, {
        title: articleDraft.title,
        body: articleDraft.body,
        tags: parseTags(articleDraft.tags),
      })
      await mutate()
      setIsCreatingArticle(false)
      setArticleDraft(emptyArticleDraft())
      if (json.article.id) selectArticle(json.article.id)
    } catch (error) {
      setArticleCreateError(errorMessageFromUnknown(error, "Failed to create article."))
    } finally {
      setIsArticleSaving(false)
    }
  }

  const handleUpdateArticle = async () => {
    if (!selectedArticle) return
    setIsEditSaving(true)
    setEditError(null)
    try {
      await updateArticle(selectedArticle.id, {
        title: editDraft.title,
        body: editDraft.body,
        tags: parseTags(editDraft.tags),
      })
      await mutate()
      setIsEditing(false)
    } catch (error) {
      setEditError(errorMessageFromUnknown(error, "Failed to update article."))
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteArticle = async () => {
    if (!selectedArticle) return
    setIsArticleDeleting(true)
    setArticleDeleteError(null)
    try {
      await deleteArticle(selectedArticle.id)
      selectArticle(null)
      await mutate()
    } catch (error) {
      setArticleDeleteError(errorMessageFromUnknown(error, "Failed to delete article."))
    } finally {
      setIsArticleDeleting(false)
    }
  }

  const startEdit = () => {
    if (!selectedArticle) return
    setEditDraft({ title: selectedArticle.title, body: selectedArticle.body, tags: selectedArticle.tags.join(", ") })
    setEditError(null)
    setArticleDeleteError(null)
    setIsEditing(true)
  }

  return {
    allArticles,
    articleCreateError,
    articleDeleteError,
    articleDraft,
    articleTargetKb,
    editDraft,
    editError,
    handleCreateArticle,
    handleCreateKb,
    handleDeleteArticle,
    handleDeleteKb,
    handleUpdateArticle,
    isArticleDeleting,
    isArticleSaving,
    isCreatingArticle,
    isCreatingKb,
    isCreatingKbSaving,
    isEditing,
    isEditSaving,
    isLoading,
    kbActionError,
    knowledgeBases,
    mobileView,
    newKbName,
    search,
    selectArticle,
    selectBase,
    selectedArticle,
    selectedArticleId,
    selectedBaseId,
    setArticleCreateError,
    setArticleDraft,
    setEditDraft,
    setEditError,
    setIsCreatingArticle,
    setIsCreatingKb,
    setIsEditing,
    setKbActionError,
    setMobileView,
    setNewKbName,
    setSearch,
    setSort,
    sort,
    startEdit,
    visibleArticles,
  }
}

export type KbPageState = ReturnType<typeof useKbPageState>
