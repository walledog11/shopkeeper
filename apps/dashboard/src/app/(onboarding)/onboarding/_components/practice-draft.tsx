import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { BookOpen, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { requestJson } from "@/lib/api/fetcher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Sources { sources: { id: string; title: string }[]; simulated: boolean }
interface Draft { draft: string; source: { id: string; title: string; excerpt: string } }

export function PracticeDraft({ enabled, syncing, onRetrySync }: { enabled: boolean; syncing: boolean; onRetrySync?: () => void }) {
  const { data, error: loadError, isLoading, mutate } = useSWR<Sources>(enabled ? "/api/onboarding/practice" : null, requestJson);
  const [sourceId, setSourceId] = useState("");
  const [question, setQuestion] = useState("What should I know about your returns policy?");
  const [result, setResult] = useState<Draft | null>(null);
  const [reply, setReply] = useState("");
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectedId = sourceId || data?.sources[0]?.id || "";

  useEffect(() => { if (!syncing && enabled) void mutate(); }, [enabled, mutate, syncing]);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function generate() {
    if (requestRef.current || !selectedId || !question.trim()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true); setError(null); setResult(null); setApproved(false);
    try {
      const next = await requestJson<Draft>("/api/onboarding/practice", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ sourceId: selectedId, question }),
      });
      if (controller.signal.aborted) return;
      setResult(next); setReply(next.draft);
    } catch {
      if (!controller.signal.aborted) setError("We couldn’t prepare that draft. Try again, or finish setup and return to your store knowledge later.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return <section className="rounded-2xl border border-foreground/10 bg-card p-4 sm:p-5" aria-labelledby="practice-title">
    <div className="mb-5 flex items-center gap-3"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground/60"><Sparkles size={21} /></span><div><h2 id="practice-title" className="text-[15px] font-semibold">A practice reply, using your store</h2><p className="mt-1 text-[12px] text-foreground/45">{data?.simulated ? "Practice with your simulated store’s knowledge" : "Practice only · nothing will be sent"}</p></div></div>
    {!enabled ? <p className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[13px] leading-relaxed text-foreground/60">Connect Shopify to prepare a reply from your store’s policies and pages.</p>
      : isLoading || syncing ? <p role="status" className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[13px] leading-relaxed text-foreground/60"><Loader2 size={16} className="mr-2 inline animate-spin" />{syncing ? "Reading your store’s policies and pages…" : "Loading your store knowledge…"}</p>
        : loadError ? <p role="alert" className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[13px] leading-relaxed text-foreground/60">We couldn’t load your store knowledge. <button className="rounded text-[12.5px] font-semibold text-foreground underline underline-offset-4" onClick={() => { void mutate(); }}>Try again</button></p>
          : !data?.sources.length ? <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[13px] leading-relaxed text-foreground/60"><p>There aren’t any imported policies or pages to use yet. You can add store knowledge from the dashboard and try a draft later.</p>{onRetrySync && <button className="rounded text-[12.5px] font-semibold text-foreground underline underline-offset-4 mt-2" onClick={onRetrySync}>Try importing again</button>}</div>
            : <>
              <label className="mb-1.5 block text-[13px] font-semibold text-foreground" htmlFor="practice-source">Use a policy or page</label>
              <select id="practice-source" value={selectedId} disabled={pending} onChange={event => { setSourceId(event.target.value); setResult(null); setApproved(false); }} className="h-11 rounded-md bg-transparent text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring w-full border border-input px-3 text-[14px]">
                {data.sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
              </select>
              <label className="mb-1.5 block text-[13px] font-semibold text-foreground mt-5" htmlFor="practice-question">A question a customer might ask</label>
              <Textarea id="practice-question" value={question} maxLength={500} disabled={pending} onChange={event => { setQuestion(event.target.value); setResult(null); setApproved(false); }} className="min-h-20 bg-background/30 text-base" />
              <Button onClick={() => { void generate(); }} disabled={pending || !question.trim()} className="min-h-11 h-auto gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold mt-4" variant={result ? "outline" : "default"}>
                {pending ? <><Loader2 size={16} className="animate-spin" />Preparing your draft…</> : result ? <><RefreshCw size={15} />Try another draft</> : <><Sparkles size={15} />Prepare a practice draft</>}
              </Button>
              {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-[13px] text-destructive mt-4 !mb-0">{error}</p>}
              {result && <div className="mt-6 border-t border-border pt-5">
                <label className="mb-1.5 block text-[13px] font-semibold text-foreground" htmlFor="practice-reply">Your draft · edit before approving</label>
                <Textarea id="practice-reply" value={reply} onChange={event => { setReply(event.target.value); setApproved(false); }} className="min-h-40 bg-background/30 text-base leading-7" />
                <details className="overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.03] mt-3"><summary className="cursor-pointer px-4 py-3 text-[12.5px] font-medium text-foreground/55"><BookOpen size={14} className="mr-2 inline" />Source provided: {result.source.title}</summary><div className="px-4 pb-4"><p className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-background/50 p-3 text-[12.5px] leading-relaxed text-foreground/60">{result.source.excerpt}</p></div></details>
                <Button onClick={() => setApproved(true)} disabled={approved || !reply.trim()} className="min-h-11 h-auto gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold mt-4"><Check size={16} />{approved ? "Practice complete" : "Approve practice draft"}</Button>
                <p role="status" className="mt-3 text-[12px] leading-relaxed text-foreground/50">{approved ? "You’ve reviewed and approved a practice reply. Nothing was sent. You’ll use the same review process for customer drafts." : "This approval is a rehearsal. It won’t send a message or update your store."}</p>
              </div>}
            </>}
  </section>;
}
