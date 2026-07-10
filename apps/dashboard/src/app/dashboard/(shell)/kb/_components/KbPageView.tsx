"use client"

import { ArrowUpDown, Check, Filter, Loader2, Plus, Search, X } from "lucide-react"
import { memoryTopicLabel } from "@shopkeeper/agent/kb-memory"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/useMobile"
import { CONTEXT_CATEGORIES } from "@/lib/memory/context"
import { ArticleEditDetail } from "./ArticleEditDetail"
import { MemoryArticleExpandDialog } from "./MemoryArticleExpandDialog"
import { MemoryCoreContext } from "./MemoryCoreContext"
import { MemoryKnowledgeList } from "./MemoryKnowledgeList"
import { MEMORY_SOURCE_FILTERS, memoryCardTitle, type MemorySourceFilter } from "./memory-page-utils"
import { StoreProfileEditDetail } from "./StoreProfileEditDetail"
import { SORT_OPTIONS, inputCls, type SortKey } from "./kb-page-utils"
import type { KbPageState } from "./useKbPageState"

const GLASS_SHELL = "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"
const GLASS_CONTROL = "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"
const GLASS_POPOVER = "w-60 rounded-2xl border-foreground/[0.08] bg-card/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_42px_rgba(43,33,24,0.18)] backdrop-blur-2xl supports-[backdrop-filter]:bg-card/65"
const SOURCE_LABEL: Record<MemorySourceFilter, string> = { all: "All", learned: "Learned", shopify: "Shopify", manual: "Notes" }

export function KbPageView({ state }: { state: KbPageState }) {
  const {
    articleCreateError, articleDeleteError, articleDraft, beginAddContext, beginCorrection,
    closeArticleOverlay, closeContextComposer, closeStoreProfile, correctionTarget, editDraft,
    editError, expandedArticle, expandArticle, handleCreateArticle, handleDeleteArticle,
    handleResolveVoiceProposal, handleSaveStoreProfile, handleUpdateArticle, hasShopifyConnection,
    isArticleDeleting, isArticleSaving, isCreatingArticle, isEditSaving, isLoading,
    isStoreProfileOpen, search, selectStoreProfile, selectedArticle, setArticleDraft, setEditDraft,
    setSearch, setSort, setSourceFilter, setTopicFilter, sort, sourceFilter, startEdit, storeProfile,
    topicFilter, topicFilters, visibleArticles, voiceProposalBusy, voiceProposalError,
  } = state
  const mobile = useIsMobile()
  const detailOpen = Boolean(expandedArticle || selectedArticle || isStoreProfileOpen || isCreatingArticle)
  useMobileChromeOverride(mobile && detailOpen ? "detail" : null)
  const filtered = Boolean(search.trim()) || sourceFilter !== "all" || topicFilter !== "all"
  const sortLabel = SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Sort"
  const topicLabel = topicFilter === "all" ? "Topic" : memoryTopicLabel(topicFilter)

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-background">
      <div className="relative z-20 shrink-0 px-3 pb-3 pt-3">
        <div className={GLASS_SHELL}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 lg:flex-1 ${GLASS_CONTROL}`}>
              <Search className="size-3.5 shrink-0 text-faint" />
              <input aria-label="Search memory" placeholder="Search store facts, policies, and guidance" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-strong outline-none placeholder:text-faint" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="text-faint hover:text-muted-foreground"><X className="size-3.5" /></button>}
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div role="tablist" aria-label="Memory source" className={`grid h-9 min-w-0 flex-1 grid-cols-4 gap-0.5 rounded-full p-0.5 lg:flex-none ${GLASS_CONTROL}`}>
                {MEMORY_SOURCE_FILTERS.map(option => {
                  const active = sourceFilter === option.value
                  return <button key={option.value} type="button" role="tab" aria-selected={active} onClick={() => setSourceFilter(option.value)} className={`h-8 min-w-0 rounded-full px-2 text-[11px] font-semibold sm:px-3 ${active ? "bg-card/80 text-foreground shadow-sm" : "text-faint hover:bg-background/35 hover:text-muted-foreground"}`}><span className="block truncate">{SOURCE_LABEL[option.value]}</span></button>
                })}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Popover>
                  <PopoverTrigger asChild><button type="button" aria-label="Filter memory by topic" className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${GLASS_CONTROL} ${topicFilter !== "all" ? "text-foreground" : "text-muted-foreground"}`}><Filter className="size-3.5" /><span className="hidden max-w-28 truncate sm:inline">{topicLabel}</span>{topicFilter !== "all" && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-400" />}</button></PopoverTrigger>
                  <PopoverContent align="end" className={GLASS_POPOVER}>
                    <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-faint">Topic</p>
                    <div className="space-y-0.5">
                      <button type="button" onClick={() => setTopicFilter("all")} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs ${topicFilter === "all" ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>All topics{topicFilter === "all" && <Check className="size-3.5" />}</button>
                      {topicFilters.map(topic => <button key={topic} type="button" onClick={() => setTopicFilter(topic)} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs ${topicFilter === topic ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04]"}`}>{memoryTopicLabel(topic)}{topicFilter === topic && <Check className="size-3.5" />}</button>)}
                    </div>
                  </PopoverContent>
                </Popover>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label={`Sort memory: ${sortLabel}`} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground ${GLASS_CONTROL}`}><ArrowUpDown className="size-3.5" /><span className="hidden xl:inline">{sortLabel}</span></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl bg-card/90 p-1.5 backdrop-blur-xl"><DropdownMenuRadioGroup value={sort} onValueChange={value => setSort(value as SortKey)}>{SORT_OPTIONS.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} className="rounded-lg text-xs">{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={beginAddContext} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background"><Plus className="size-3.5" />Add context</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin text-faint" /></div> : (
        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] xl:gap-9">
            <MemoryCoreContext storeName={storeProfile.name} aiContext={storeProfile.aiContext} brandVoice={storeProfile.brandVoice} sampleReplies={storeProfile.sampleReplies} proposal={storeProfile.voiceProposal} proposalBusy={voiceProposalBusy} proposalError={voiceProposalError} onEdit={selectStoreProfile} onResolveProposal={handleResolveVoiceProposal} />
            <MemoryKnowledgeList articles={visibleArticles} hasActiveFilters={filtered} hasShopifyConnection={hasShopifyConnection} onOpenArticle={expandArticle} />
          </div>
        </div>
      )}

      <DashboardDetailDialog open={isCreatingArticle} title={correctionTarget ? "Correct context" : "Add context"} maxWidthClassName="sm:max-w-2xl" onClose={closeContextComposer}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><p className="text-xs font-semibold uppercase text-faint">Memory</p><h2 className="mt-1 text-lg font-semibold text-foreground">{correctionTarget ? "Correct context" : "Add context"}</h2><p className="mt-1 text-xs text-muted-foreground">{correctionTarget ? `Replace what the agent currently knows about ${memoryCardTitle(correctionTarget)}.` : "Add a fact, policy, or writing preference the agent should remember."}</p></div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <textarea autoFocus aria-label="Context for the agent" placeholder={correctionTarget ? "Write the accurate information the agent should use instead." : "e.g. Never call our products cheap; say affordable."} value={articleDraft.body} onChange={event => setArticleDraft(draft => ({ ...draft, body: event.target.value }))} rows={9} maxLength={4000} className={`${inputCls} resize-none`} />
            <div className="mt-2 flex justify-between text-xs text-faint"><span>{articleDraft.body.length.toLocaleString()} / 4,000</span><span>{correctionTarget ? "Overrides the original context" : "Saved to your notes"}</span></div>
            <div className="mt-6"><p className="mb-2 text-xs font-semibold text-muted-foreground">Topic</p><div className="flex flex-wrap gap-1.5">{CONTEXT_CATEGORIES.map(category => <button key={category.value} type="button" onClick={() => setArticleDraft(draft => ({ ...draft, category: category.value }))} className={`rounded-full border px-3 py-1.5 text-xs ${articleDraft.category === category.value ? "border-foreground/20 bg-foreground/[0.09] text-foreground" : "border-border text-muted-foreground"}`}>{category.label}</button>)}</div></div>
          </div>
          <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">{articleCreateError && <p className="mb-3 text-xs text-red-400">{articleCreateError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={closeContextComposer} className="px-3 py-1.5 text-xs text-faint">Cancel</button><button type="button" onClick={handleCreateArticle} disabled={isArticleSaving || !articleDraft.body.trim()} className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40">{isArticleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{correctionTarget ? "Save correction" : "Add to memory"}</button></div></div>
        </div>
      </DashboardDetailDialog>

      <DashboardDetailDialog open={isStoreProfileOpen} title="Core context" maxWidthClassName="sm:max-w-3xl lg:max-w-5xl" onClose={closeStoreProfile}><StoreProfileEditDetail storeName={storeProfile.name} aiContext={storeProfile.aiContext} brandVoice={storeProfile.brandVoice} sampleReplies={storeProfile.sampleReplies} onSave={handleSaveStoreProfile} onBack={closeStoreProfile} /></DashboardDetailDialog>
      <MemoryArticleExpandDialog article={expandedArticle} deleteError={articleDeleteError} isDeleting={isArticleDeleting} onClose={closeArticleOverlay} onCorrect={beginCorrection} onDelete={handleDeleteArticle} onEdit={startEdit} />
      <DashboardDetailDialog open={Boolean(selectedArticle)} title="Edit note" maxWidthClassName="sm:max-w-2xl" onClose={closeArticleOverlay}>{selectedArticle ? <ArticleEditDetail editDraft={editDraft} editError={editError} isSaving={isEditSaving} onEditDraftChange={setEditDraft} onCancelEdit={closeArticleOverlay} onSaveEdit={handleUpdateArticle} /> : null}</DashboardDetailDialog>
    </div>
  )
}
