"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const TRANSITION_MS = 480;

const SCENES = [
  { id: "request", duration: 2600 },
  { id: "verify", duration: 3200 },
  { id: "ask", duration: 3400 },
  { id: "done", duration: 3200 },
] as const;

type SceneMotion = "enter" | "leave" | "idle";

export function HeroMedia() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(true);
  const [staticPlay, setStaticPlay] = useState(false);
  const [scene, setScene] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [playId, setPlayId] = useState(0);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStaticPlay(true);
      setIntro(false);
      setReady(true);
      return;
    }

    const el = stageRef.current;
    if (!el) {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(el);
    setReady(true);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!intro || staticPlay) return;
    const timer = window.setTimeout(() => setIntro(false), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [intro, staticPlay]);

  useEffect(() => {
    if (!ready || !inView || staticPlay) return;
    const timer = window.setTimeout(() => {
      setLeaving(scene);
      setScene((current) => (current + 1) % SCENES.length);
      setPlayId((id) => id + 1);
    }, SCENES[scene].duration);
    return () => window.clearTimeout(timer);
  }, [ready, inView, staticPlay, scene]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const playing = ready && inView && !staticPlay;
  const active = SCENES[scene];
  const incomingMotion: SceneMotion = intro || leaving !== null ? "enter" : "idle";

  return (
    <figure
      aria-labelledby="hero-workflow-caption"
      className="relative mx-auto w-full max-w-[520px] text-left"
    >
      <figcaption id="hero-workflow-caption" className="sr-only">
        A representative Linen &amp; Loom workflow, shown one step at a time. Maya
        asks through Instagram to swap the Linen Jumpsuit on order 3102 from Medium
        to Small. Shopkeeper reads the request, checks that the order is unfulfilled
        and Small is in stock, asks the merchant to approve over iMessage, updates
        Shopify, replies to Maya, and Maya thanks them. All details are fictional.
      </figcaption>

      <div
        ref={stageRef}
        className={staticPlay ? "m-hero-stage is-static" : "m-hero-stage"}
        aria-hidden
        data-scene={staticPlay ? "all" : active.id}
      >
        {staticPlay ? (
          SCENES.map((step, index) => (
            <SceneView key={step.id} index={index} playing={false} frozen motion="idle" />
          ))
        ) : (
          <>
            {leaving !== null ? (
              <SceneView
                key={`leave-${leaving}`}
                index={leaving}
                playing={false}
                frozen
                motion="leave"
              />
            ) : null}
            <SceneView
              key={`enter-${scene}-${playId}`}
              index={scene}
              playing={playing}
              frozen={false}
              motion={incomingMotion}
            />
          </>
        )}
      </div>
    </figure>
  );
}

function SceneView({
  index,
  playing,
  frozen,
  motion,
}: {
  index: number;
  playing: boolean;
  frozen: boolean;
  motion: SceneMotion;
}) {
  const props = { playing, staticPlay: frozen, motion };
  if (index === 0) return <RequestScene {...props} />;
  if (index === 1) return <VerifyScene {...props} />;
  if (index === 2) return <AskScene {...props} />;
  return <DoneScene {...props} />;
}

function RequestScene({
  playing,
  staticPlay,
  motion,
}: {
  playing: boolean;
  staticPlay: boolean;
  motion: SceneMotion;
}) {
  return (
    <div className={sceneClass("request", playing, staticPlay, motion)}>
      <IgFrame markId={`m-hero-ig-${motion}`}>
        <p className="m-hero-ig-time">Today 2:14 AM</p>
        <MayaRequestMessages />
      </IgFrame>
    </div>
  );
}

function VerifyScene({
  playing,
  staticPlay,
  motion,
}: {
  playing: boolean;
  staticPlay: boolean;
  motion: SceneMotion;
}) {
  return (
    <div className={sceneClass("verify", playing, staticPlay, motion)}>
      <div className="m-hero-stack">
        <ChannelPill
          icon={
            <Image
              src="/logos/shopify.svg"
              alt=""
              width={22}
              height={25}
              className="m-hero-logo-shopify"
            />
          }
          label="Order #3102"
        />
        <CheckTile index={0} label="Check fulfillment status" />
        <CheckTile index={1} label="Verify 12 Small items in stock" />
        <div className="m-hero-swap" style={{ "--i": 2 } as CSSProperties}>
          <span className="m-hero-mini">Medium</span>
          <span className="m-hero-arrow" aria-hidden>
            →
          </span>
          <span className="m-hero-mini is-new">Small</span>
        </div>
      </div>
    </div>
  );
}

function AskScene({
  playing,
  staticPlay,
  motion,
}: {
  playing: boolean;
  staticPlay: boolean;
  motion: SceneMotion;
}) {
  return (
    <div className={sceneClass("ask", playing, staticPlay, motion)}>
      <div className="m-hero-stack">
        <ChannelPill
          icon={
            <Image
              src="/logos/imessage.svg"
              alt=""
              width={22}
              height={22}
              className="m-hero-logo"
            />
          }
          label="You"
        />
        <div className="m-hero-bubble" style={{ "--i": 0 } as CSSProperties}>
          Maya wants Small / Sand. Same price, in stock. I can update Shopify,
          then reply.
        </div>
        <div className="m-hero-approve" style={{ "--i": 1 } as CSSProperties}>
          <span className="m-hero-approve-idle">Approve</span>
          <span className="m-hero-approve-done">
            <CheckIcon />
            Approved
          </span>
        </div>
      </div>
    </div>
  );
}

function DoneScene({
  playing,
  staticPlay,
  motion,
}: {
  playing: boolean;
  staticPlay: boolean;
  motion: SceneMotion;
}) {
  return (
    <div className={sceneClass("done", playing, staticPlay, motion)}>
      <IgFrame markId={`m-hero-ig-done-${motion}`}>
        <p className="m-hero-ig-time">Today 2:14 AM</p>
        <MayaRequestMessages prior />
        <div className="m-hero-ig-row is-out" style={{ "--i": 0 } as CSSProperties}>
          <p className="m-hero-ig-out">Done — your jumpsuit is now Small / Sand.</p>
        </div>
        <div className="m-hero-ig-row" style={{ "--i": 1 } as CSSProperties}>
          <span className="m-hero-ig-avatar is-tiny">MC</span>
          <p className="m-hero-ig-in is-first">perfect, thank you!</p>
        </div>
      </IgFrame>
    </div>
  );
}

function IgFrame({ children, markId }: { children: ReactNode; markId: string }) {
  return (
    <div className="m-hero-ig">
      <div className="m-hero-ig-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
          <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="m-hero-ig-avatar">MC</span>
        <div className="m-hero-ig-who">
          <p>Maya Chen</p>
          <p>Active now</p>
        </div>
        <InstagramMark id={markId} />
      </div>
      <div className="m-hero-ig-thread">{children}</div>
      <div className="m-hero-ig-compose">
        <span>Message...</span>
      </div>
    </div>
  );
}

function MayaRequestMessages({ prior = false }: { prior?: boolean }) {
  return (
    <>
      <div className={`m-hero-ig-row${prior ? " is-prior" : ""}`} style={{ "--i": 0 } as CSSProperties}>
        <span className="m-hero-ig-avatar is-tiny">MC</span>
        <p className="m-hero-ig-in is-first">hey! I ordered the linen jumpsuit in M but need S</p>
      </div>
      <div className={`m-hero-ig-row${prior ? " is-prior" : ""}`} style={{ "--i": 1 } as CSSProperties}>
        <span className="m-hero-ig-avatar is-tiny is-spacer" aria-hidden />
        <p className="m-hero-ig-in is-last">can you switch it before it ships?</p>
      </div>
    </>
  );
}

function sceneClass(name: string, playing: boolean, staticPlay: boolean, motion: SceneMotion) {
  return [
    "m-hero-scene",
    `is-${name}`,
    playing ? "is-playing" : "",
    staticPlay ? "is-static" : "",
    motion === "enter" ? "is-enter" : "",
    motion === "leave" ? "is-leave" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function ChannelPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="m-hero-channel">
      <span className="m-hero-channel-icon">{icon}</span>
      <span className="m-hero-channel-label">{label}</span>
    </div>
  );
}

function CheckTile({ index, label }: { index: number; label: string }) {
  return (
    <div className="m-hero-tile" style={{ "--i": index } as CSSProperties}>
      <span className="m-hero-tile-label">{label}</span>
      <span className="m-hero-status">
        <span className="m-hero-loader" />
        <span className="m-hero-check">
          <CheckIcon />
        </span>
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.4 9.2 17 19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InstagramMark({ id = "m-hero-ig" }: { id?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id={id} cx="30%" cy="110%" r="120%">
          <stop offset="0%" stopColor="#f58529" />
          <stop offset="45%" stopColor="#dd2a7b" />
          <stop offset="100%" stopColor="#8134af" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill={`url(#${id})`} />
      <rect
        x="7.2"
        y="7.2"
        width="9.6"
        height="9.6"
        rx="3.2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
      />
      <circle cx="16.6" cy="7.4" r="1.05" fill="#fff" />
    </svg>
  );
}
