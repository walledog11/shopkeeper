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
  Video,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";

/* The phone and the cards around it in the hero story (Story.tsx), and the
   morning lock screen (MorningText.tsx). Every state is drawn up front; a beat
   only switches classes on the scene, so moving between beats is CSS
   transitions and the server render is the hero frame.

   Beats: 0 the hero (a DM, then a text on the lock screen), 1 the order check,
   2 the approval text, 3 the "yes" and the result, 4 the record. The approval
   text follows the card the gateway sends (`formatOperatorPlanMessage`); the
   briefing follows `formatHandledSection` and `formatSalesPulseLine`. */

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

/** Shopkeeper's contact photo is its app icon; on the lock screen it carries the Messages badge. */
function ShopkeeperPhoto({ badge = false, className }: { badge?: boolean; className?: string }) {
  return (
    <span className={cn("m-ios-photo", className)}>
      <span className="m-ios-photo-img">
        <Image src="/logos/shopkeeper-shop-logo.png" alt="" fill sizes="48px" />
      </span>
      {badge ? <Image src="/logos/imessage.svg" alt="" width={16} height={16} className="m-ios-badge" /> : null}
    </span>
  );
}

/** Laid out around the Dynamic Island the way iOS does: time centred in the left
 *  ear, signal, Wi-Fi and battery centred in the right one. */
function StatusBar({ time }: { time: ReactNode }) {
  return (
    <div className="m-ios-status">
      <span className="m-ios-status-time">{time}</span>
      <span />
      <span className="m-ios-status-icons">
        <svg viewBox="0 0 17 11" className="h-[8.5px] w-[13px]" fill="currentColor">
          <rect x="0" y="7.5" width="3" height="3.5" rx="0.8" />
          <rect x="4.6" y="5.2" width="3" height="5.8" rx="0.8" />
          <rect x="9.2" y="2.8" width="3" height="8.2" rx="0.8" />
          <rect x="13.8" y="0" width="3" height="11" rx="0.8" />
        </svg>
        <svg viewBox="0 0 15 11" className="h-[8.5px] w-[12px]" fill="currentColor">
          <path d="M7.5 2.1c2.2 0 4.2.8 5.8 2.3l1.1-1.2A10 10 0 0 0 7.5.4 10 10 0 0 0 .6 3.2l1.1 1.2a8.4 8.4 0 0 1 5.8-2.3Zm0 3.4c1.3 0 2.6.5 3.6 1.4l1.1-1.2a7 7 0 0 0-9.4 0L3.9 6.9a5.3 5.3 0 0 1 3.6-1.4Zm0 3.3c.6 0 1.1.2 1.5.6L7.5 11 6 9.4c.4-.4.9-.6 1.5-.6Z" />
        </svg>
        <span className="m-ios-battery">
          <span />
        </span>
      </span>
    </div>
  );
}

function LockActions() {
  return (
    <div className="m-lock-actions">
      <span>
        <Flashlight strokeWidth={2} />
      </span>
      <span>
        <Camera strokeWidth={2} />
      </span>
    </div>
  );
}

function Notification({ children }: { children: ReactNode }) {
  return (
    <div className="m-notif">
      <ShopkeeperPhoto badge className="m-notif-photo" />
      <div className="min-w-0 flex-1">
        <p className="m-notif-head">
          <span>Shopkeeper</span>
          <span>now</span>
        </p>
        <p className="m-notif-body">{children}</p>
      </div>
    </div>
  );
}

function Phone({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("m-phone", className)}>
      <span className="m-phone-btn is-action" />
      <span className="m-phone-btn is-up" />
      <span className="m-phone-btn is-down" />
      <span className="m-phone-btn is-power" />
      <div className="m-phone-screen">
        {children}
        <span className="m-phone-island" />
        <span className="m-phone-home" />
        <span className="m-phone-glare" />
      </div>
    </div>
  );
}

function StoryPhone() {
  return (
    <Phone>
      <div className="m-lock">
        <Image src="/atmosphere/footer-dawn.jpg" alt="" fill sizes="320px" className="m-lock-wall" />
        <p className="m-lock-date">Friday, November 6</p>
        <p className="m-lock-time">2:14</p>
        <div className="m-notif-stack m-notif-arrive">
          <Notification>
            Maya Chen asked to swap her linen jumpsuit from M to S on #3102. It hasn’t shipped, and the Small is in stock.
          </Notification>
        </div>
        <LockActions />
      </div>

      <div className="m-msgs">
        <div className="m-msgs-head">
          <span className="m-msgs-back">
            <ChevronLeft strokeWidth={2.6} />
          </span>
          <span className="m-msgs-contact">
            <ShopkeeperPhoto />
            <span className="m-msgs-name">
              Shopkeeper
              <ChevronRight strokeWidth={2.6} />
            </span>
          </span>
          <Video className="m-msgs-facetime" strokeWidth={2} />
        </div>
        <div className="m-msgs-thread">
          <p className="m-ib-stamp">
            iMessage
            <br />
            <b>Today</b> 2:14 AM
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
            <p className="m-ib-stamp">
              <b>Today</b> 7:02 AM
            </p>
          </Arrive>
          <Arrive at={3} delay="[--d:.15s]" end>
            <div className="m-ib m-ib-me m-ib-tail">
              <span>yes</span>
            </div>
          </Arrive>
          <Arrive at={3} delay="[--d:.55s]" end>
            <p className="m-ib-receipt">
              <b>Read</b> 7:02 AM
            </p>
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
            <Plus strokeWidth={2.4} />
          </span>
          <span className="m-msgs-field">
            iMessage
            <Mic strokeWidth={2} />
          </span>
        </div>
      </div>

      <StatusBar
        time={
          <>
            <span className="m-time-night">2:14</span>
            <span className="m-time-day">7:02</span>
          </>
        }
      />
    </Phone>
  );
}

const briefing = [
  "Since your last briefing I handled six things, including four replies and a refund. Five of those ran without needing you.",
  "Riley asked to change the delivery address for #3107.",
  "9 orders and $684 since your last briefing. This time last week it was 6 orders and $455.",
] as const;

/** The briefing as it lands: three texts on the lock screen at 7:00. */
export function MorningPhone() {
  return (
    <Phone className="m-phone--morning">
      <div className="m-lock is-morning">
        <Image src="/atmosphere/footer-dawn.jpg" alt="" fill sizes="320px" className="m-lock-wall" />
        <p className="m-lock-date">Friday, November 6</p>
        <p className="m-lock-time">7:00</p>
        <div className="m-notif-stack">
          {briefing.map((text) => (
            <Notification key={text}>{text}</Notification>
          ))}
        </div>
        <LockActions />
      </div>
      <StatusBar time="7:00" />
    </Phone>
  );
}

function IgCard({ className }: { className?: string }) {
  return (
    <div className={cn("m-chat m-chat--instagram m-ig", className)}>
      <div className="m-chat-head">
        <span className="m-chat-avatar">MC</span>
        <span className="min-w-0">
          <span className="m-chat-name block">Maya Chen</span>
          <span className="m-ig-handle">maya.chen</span>
        </span>
        <Image src="/logos/instagram-logo.png" alt="" width={20} height={20} className="m-card-logo" />
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
        <Image src="/logos/shopify.svg" alt="" width={16} height={18} className="m-card-logo" />
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
        <StoryPhone />
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
      <StoryPhone />
    </div>
  );
}
