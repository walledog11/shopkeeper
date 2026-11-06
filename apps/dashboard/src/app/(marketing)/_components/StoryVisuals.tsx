import Image from "next/image";
import type { ReactNode } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Flashlight,
  MessageCircle,
  Mic,
  PackageCheck,
  Plus,
  Send,
  Smartphone,
  Store,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";

/* The phone and the cards around it in the hero story (Story.tsx). Every state
   is drawn up front; a beat only switches classes on the scene, so moving
   between beats is CSS transitions and the server render is the hero frame.

   Beats: 0 the hero (a DM, then a text on the lock screen), 1 the order check,
   2 the approval text, 3 the "yes" and the result, 4 the record. The approval
   text follows the card the gateway sends (`formatOperatorPlanMessage`). */

export type Beat = 0 | 1 | 2 | 3 | 4;

/** Cumulative: a line that arrives at beat 2 stays through beats 3 and 4. */
function beatClasses(beat: Beat) {
  return cn(beat >= 1 && "is-b1", beat >= 2 && "is-b2", beat >= 3 && "is-b3", beat >= 4 && "is-b4");
}

/** A line that slides into its thread at a beat. `delay` is a Tailwind `[--d:…]` class. */
function Arrive({ at, delay, end, children }: { at: 2 | 3; delay?: string; end?: boolean; children: ReactNode }) {
  return (
    <div className={cn("m-arrive", `m-at-${at}`, delay)}>
      <div className={cn("m-arrive-inner", end && "is-end")}>{children}</div>
    </div>
  );
}

function Typing({ at }: { at: 2 | 3 }) {
  return (
    <div className={cn("m-typing", `m-typing-${at}`)}>
      <div className="m-arrive-inner">
        <span className="m-ib m-ib-them m-ib-typing">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

function ContactAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("m-ios-avatar", className)}>
      <Store strokeWidth={2} />
    </span>
  );
}

function StatusBar() {
  return (
    <div className="m-ios-status">
      <span>
        <span className="m-time-night">2:14</span>
        <span className="m-time-day">7:02</span>
      </span>
      <span className="flex items-center gap-[5px]">
        <svg viewBox="0 0 18 12" className="h-[10px] w-[15px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-[10px] w-[13px]" fill="currentColor">
          <path d="M8 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.8 10.8 0 0 0 8 .5 10.8 10.8 0 0 0 .5 3.5l1.2 1.3A9 9 0 0 1 8 2.3Zm0 3.6c1.5 0 2.9.6 4 1.6l1.2-1.3a7.6 7.6 0 0 0-10.4 0L4 7.5a5.8 5.8 0 0 1 4-1.6Zm0 3.6c.6 0 1.2.2 1.6.6L8 12 6.4 10.1c.4-.4 1-.6 1.6-.6Z" />
        </svg>
        <span className="relative inline-flex h-[11px] w-[22px] items-center rounded-[3.5px] border border-current/40 p-[1.5px]">
          <span className="h-full w-[75%] rounded-[1.5px] bg-current" />
          <span className="absolute -right-[3px] top-1/2 h-[4px] w-[1.5px] -translate-y-1/2 rounded-r-sm bg-current/40" />
        </span>
      </span>
    </div>
  );
}

function LockScreen() {
  return (
    <div className="m-lock">
      <Image src="/atmosphere/footer-dawn.jpg" alt="" fill sizes="300px" className="m-lock-wall" />
      <p className="m-lock-date">Friday, November 6</p>
      <p className="m-lock-time">2:14</p>
      <div className="m-notif">
        <ContactAvatar className="m-notif-avatar" />
        <div className="min-w-0">
          <p className="m-notif-head">
            <span>Shopkeeper</span>
            <span>now</span>
          </p>
          <p className="m-notif-body">
            Maya Chen asked to swap her linen jumpsuit from M to S on #3102. It hasn’t shipped, and the Small is in stock.
          </p>
        </div>
      </div>
      <div className="m-lock-actions">
        <span>
          <Flashlight strokeWidth={2} />
        </span>
        <span>
          <Camera strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

function MessagesScreen() {
  return (
    <div className="m-msgs">
      <div className="m-msgs-head">
        <ChevronLeft className="m-msgs-back" strokeWidth={2.5} />
        <ContactAvatar />
        <p className="m-msgs-name">
          Shopkeeper
          <ChevronRight strokeWidth={2.5} />
        </p>
      </div>
      <div className="m-msgs-thread">
        <p className="m-ib-stamp">
          <b>iMessage</b>
          <br />
          Today 2:14 AM
        </p>
        <Typing at={2} />
        <Arrive at={2} delay="[--d:.9s]">
          <div className="m-ib m-ib-them m-ib-tail">
            <span>Maya Chen asked to swap her linen jumpsuit from M to S on #3102. It hasn’t shipped, and the Small is in stock.</span>
            <span>I’d swap the Medium for the Small, then reply on Instagram:</span>
            <span>“Done! Your order #3102 is now a Small, same price.”</span>
            <span>OK to go ahead?</span>
          </div>
        </Arrive>
        <Arrive at={3}>
          <p className="m-ib-stamp">Today 7:02 AM</p>
        </Arrive>
        <Arrive at={3} delay="[--d:.15s]" end>
          <div className="m-ib m-ib-me m-ib-tail">
            <span>yes</span>
          </div>
        </Arrive>
        <Arrive at={3} delay="[--d:.55s]" end>
          <p className="m-ib-receipt">Read 7:02 AM</p>
        </Arrive>
        <Typing at={3} />
        <Arrive at={3} delay="[--d:1.7s]">
          <div className="m-ib m-ib-them m-ib-tail">
            <span>Done. #3102 is updated in Shopify, and Maya has her reply.</span>
          </div>
        </Arrive>
      </div>
      <div className="m-msgs-input">
        <span className="m-msgs-plus">
          <Plus strokeWidth={2.5} />
        </span>
        <span className="m-msgs-field">
          iMessage
          <Mic strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

function Phone() {
  return (
    <div className="m-phone">
      <span className="m-phone-btn is-action" />
      <span className="m-phone-btn is-up" />
      <span className="m-phone-btn is-down" />
      <span className="m-phone-btn is-power" />
      <div className="m-phone-screen">
        <LockScreen />
        <MessagesScreen />
        <StatusBar />
        <span className="m-phone-island" />
        <span className="m-phone-home" />
      </div>
    </div>
  );
}

function InstagramGlyph() {
  return (
    <span className="m-ig-glyph">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <rect x="5" y="5" width="14" height="14" rx="4.5" />
        <circle cx="12" cy="12" r="3.4" />
        <circle cx="16.3" cy="7.7" r="0.4" fill="#fff" />
      </svg>
    </span>
  );
}

function IgCard({ className }: { className?: string }) {
  return (
    <div className={cn("m-chat m-chat--instagram m-ig", className)}>
      <div className="m-chat-head">
        <span className="m-chat-avatar">MC</span>
        <span className="m-chat-name">Maya Chen</span>
        <InstagramGlyph />
      </div>
      <div className="m-chat-thread">
        <p className="m-chat-stamp">2:14 AM</p>
        <div className="m-ig-line">
          <div className="m-chat-bubble is-them m-chat-step [animation-delay:250ms]">hi! I ordered the linen jumpsuit in M but I need an S</div>
        </div>
        <div className="m-ig-line">
          <div className="m-chat-bubble is-them m-chat-step [animation-delay:750ms]">can you switch it before it ships?</div>
        </div>
        <Arrive at={3} delay="[--d:2s]">
          <p className="m-chat-stamp">7:02 AM</p>
        </Arrive>
        <Arrive at={3} delay="[--d:2s]" end>
          <div className="m-chat-bubble is-me">Done! Your order #3102 is now a Small, same price.</div>
        </Arrive>
        <Arrive at={3} delay="[--d:2.7s]">
          <div className="m-chat-bubble is-them">omg thank you!!</div>
        </Arrive>
      </div>
    </div>
  );
}

function OrderCard({ className }: { className?: string }) {
  return (
    <div className={cn("m-order", className)}>
      <div className="m-order-head">
        <span className="m-order-num">#3102</span>
        <span className="m-badge is-paid">Paid</span>
        <span className="m-badge is-open">Unfulfilled</span>
      </div>
      <p className="m-order-meta">Maya Chen · Instagram</p>
      <div className="m-order-line">
        <span className="m-order-thumb" />
        <div className="min-w-0 flex-1">
          <p className="m-order-title">Linen Jumpsuit</p>
          <p className="m-order-variant">
            <span className="m-var-old">Sand / M</span>
            <span className="m-var-new">Sand / S</span>
          </p>
        </div>
        <p className="m-order-price">$148.00</p>
      </div>
      <ul className="m-order-checks">
        <li className="m-check [--d:.45s]">
          <span className="m-check-icon">
            <Check strokeWidth={3} />
          </span>
          Not shipped yet
        </li>
        <li className="m-check [--d:.85s]">
          <span className="m-check-icon">
            <Check strokeWidth={3} />
          </span>
          Sand / S · 12 in stock
        </li>
      </ul>
    </div>
  );
}

const activity = [
  { time: "2:14 AM", text: "Maya asked to swap M for S", Icon: MessageCircle, delay: "[--d:.1s]" },
  { time: "2:14 AM", text: "Sent you the reply to approve", Icon: Smartphone, delay: "[--d:.25s]" },
  { time: "7:02 AM", text: "Approved by you", Icon: Check, delay: "[--d:.4s]" },
  { time: "7:02 AM", text: "Updated #3102 in Shopify", Icon: PackageCheck, delay: "[--d:.55s]" },
  { time: "7:02 AM", text: "Replied to Maya on Instagram", Icon: Send, delay: "[--d:.7s]" },
] as const;

function ActivityCard({ className }: { className?: string }) {
  return (
    <div className={cn("m-log", className)}>
      <div className="m-log-head">
        <p>#3102 · Maya Chen</p>
        <span className="m-badge is-done">Handled</span>
      </div>
      <ol>
        {activity.map(({ time, text, Icon, delay }) => (
          <li key={text} className={cn("m-log-row", delay)}>
            <span className="m-log-dot">
              <Icon strokeWidth={2.25} />
            </span>
            <span className="m-log-text">{text}</span>
            <span className="m-log-time">{time}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const STORY_SCENE_LABEL =
  "Maya messages a store on Instagram at 2:14 AM asking to swap her jumpsuit from a Medium to a Small. Shopkeeper checks the order in Shopify and texts the owner the exact reply it would send. At 7:02 AM the owner replies yes, the order is updated, Maya gets her reply, and every step is logged.";

/** The pinned scene on wide screens: every layer at once, shown by beat. */
export function PinnedScene({ beat }: { beat: Beat }) {
  return (
    <div className="m-stage-fit">
      <div className={cn("m-stage", beatClasses(beat))} data-beat={beat}>
        <Phone />
        <IgCard className="m-stage-ig" />
        <OrderCard className="m-stage-order" />
        <ActivityCard className="m-stage-log" />
      </div>
    </div>
  );
}

/** One beat's picture on narrow screens, in normal flow under its text. */
export function InlineScene({ beat }: { beat: Beat }) {
  const classes = cn("m-scene", `m-scene--b${beat}`, beatClasses(beat));
  if (beat === 1) return <div className={classes}><OrderCard /></div>;
  if (beat === 4) return <div className={classes}><ActivityCard /></div>;
  return (
    <div className={classes}>
      {beat !== 2 ? <IgCard className="m-scene-ig" /> : null}
      <Phone />
    </div>
  );
}
