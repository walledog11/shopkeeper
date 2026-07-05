"use client";

import Image from "next/image";
import { useRef } from "react";
import { Reveal } from "./Reveal";
import { SectionLabel } from "./SectionLabel";
import { TypingBubble, type ChatMessage, type ClusterPosition } from "./chat-demo/shared";
import { useChatDemoAnimation } from "./chat-demo/useChatDemoAnimation";

type BriefingMessage = ChatMessage & { divider?: string };

const briefingMessages: BriefingMessage[] = [
  {
    from: "agent",
    text: "Morning ☀️ 6 messages came in overnight — all handled. Four tracking checks, a sizing question, and Maya ordered the linen jumpsuit in M but meant S. I fixed order #3102 in Shopify before it shipped and sent her the new confirmation.",
    time: "7:31 AM",
    divider: "Today 7:31 AM",
  },
  { from: "user", text: "anything need me?", time: "7:48 AM" },
  {
    from: "agent",
    text: "Just one: Dana's parcel says delivered but she can't find it. I sent her the carrier's delivery photo and opened a trace with USPS — I'll update you at 5 if it hasn't turned up.",
    time: "7:48 AM",
  },
  {
    from: "agent",
    text: "Update: found it — safe with her neighbor 📦 Nothing else needs you today.",
    time: "4:02 PM",
    divider: "4:02 PM",
  },
];

const agentBubble =
  "border border-stone-900/10 bg-[#fdfbf7]/95 text-stone-800 shadow-[0_14px_34px_rgba(43,33,24,0.14)]";

function agentRadius(cluster: ClusterPosition) {
  if (cluster === "single" || cluster === "last") return "rounded-[22px] rounded-bl-[8px]";
  return "rounded-[22px]";
}

/** Like getClusterPosition, but a time divider also breaks the cluster. */
function clusterOf(visible: BriefingMessage[], index: number): ClusterPosition {
  const current = visible[index];
  const previousMatches = index > 0 && visible[index - 1].from === current.from && !current.divider;
  const nextMatches =
    index < visible.length - 1 && visible[index + 1].from === current.from && !visible[index + 1].divider;
  if (!previousMatches && !nextMatches) return "single";
  if (!previousMatches && nextMatches) return "first";
  if (previousMatches && nextMatches) return "middle";
  return "last";
}

function Avatar() {
  return (
    <span className="mb-1 grid size-8 shrink-0 place-items-center self-end rounded-full bg-[#2f7a4a] text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(43,33,24,0.2)]">
      S
    </span>
  );
}

function BriefingConversation() {
  const frameRef = useRef<HTMLDivElement>(null);
  const { count, typing } = useChatDemoAnimation(briefingMessages, frameRef);
  const visible = briefingMessages.slice(0, count);

  return (
    <div
      ref={frameRef}
      className="flex min-h-[480px] w-full flex-col justify-start gap-6 animate-[m-float_7s_ease-in-out_infinite] motion-reduce:animate-none md:h-[540px]"
    >
      {visible.map((message, index) => {
        const cluster = clusterOf(visible, index);
        const showSender =
          message.from === "agent" && (cluster === "single" || cluster === "first");

        return (
          <div key={`${message.from}-${message.time}-${index}`} className="flex flex-col gap-2.5">
            {message.divider && (
              <div className="animate-[m-msg_0.35s_ease] py-1 text-center text-[13px] text-stone-500">
                {message.divider}
              </div>
            )}
            {message.from === "agent" ? (
              <div className="flex max-w-[96%] animate-[m-msg_0.35s_ease] items-end gap-2.5 self-start">
                {showSender ? <Avatar /> : <span className="size-8 shrink-0" aria-hidden />}
                <div className="min-w-0">
                  {showSender && (
                    <div className="mb-1 pl-1 text-[12px] leading-tight text-stone-500">Shopkeeper</div>
                  )}
                  <div className={`px-5 py-3.5 text-[15px] leading-relaxed ${agentBubble} ${agentRadius(cluster)}`}>
                    {message.text}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex max-w-[72%] animate-[m-msg_0.35s_ease] flex-col items-end self-end">
                <div className="rounded-[22px] rounded-br-[8px] bg-[#2b2118] px-5 py-3.5 text-[15px] leading-relaxed text-[#f6f2eb] shadow-[0_14px_34px_rgba(43,33,24,0.2)]">
                  {message.text}
                </div>
                <span className="mt-1 pr-1 text-[11px] leading-none text-stone-500">Read {message.time}</span>
              </div>
            )}
          </div>
        );
      })}
      {typing && (
        <div className="flex max-w-[96%] animate-[m-msg_0.25s_ease] items-end gap-2.5 self-start">
          <Avatar />
          <TypingBubble receivedClass={agentBubble} />
        </div>
      )}
    </div>
  );
}

export function Integrations() {
  return (
    <section id="briefing" className="relative isolate scroll-mt-24 overflow-hidden py-12">
      {/* Photographic wash band — placeholder photography, swap
          /atmosphere/integrations-leaves.jpg for the final shot. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent_10%,black_42%,black_72%,transparent_96%)]"
      >
        <Image
          src="/atmosphere/integrations-leaves.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[72%_center] [filter:sepia(0.1)_saturate(0.8)_brightness(1.12)_contrast(0.88)]"
        />
        <div className="absolute inset-0 bg-[#f6f2eb]/50" />
        <div className="m-grain absolute inset-0" />
      </div>

      <div className="mx-auto max-w-6xl px-6 text-center">
        <Reveal>
          <SectionLabel>every morning</SectionLabel>
          <h2 className="mx-auto mb-5 max-w-[18ch] text-[clamp(36px,5vw,68px)] font-bold leading-[1.05] tracking-[0.03em] [font-family:var(--m-hand)]">
            Wake up to a briefing, <em className="italic text-[var(--m-quill)]">not a backlog.</em>
          </h2>
          <p className="mx-auto mb-14 max-w-[52ch] text-[16px] leading-relaxed text-stone-700">
            Every morning, Shopkeeper texts you what happened overnight — the questions it answered, the
            orders it fixed in Shopify, and the rare thing that actually needs your call.
          </p>
        </Reveal>

        <Reveal delay={120} className="mx-auto max-w-[620px] text-left">
          <BriefingConversation />
        </Reveal>
      </div>
    </section>
  );
}
