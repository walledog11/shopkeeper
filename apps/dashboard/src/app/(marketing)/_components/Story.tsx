import Image from "next/image";
import { cn } from "@/lib/ui/cn";
import { StoryStage } from "./StoryStage";
import { InlineScene, STORY_SCENE_LABEL, type Beat } from "./StoryVisuals";
import { WaitlistForm } from "./WaitlistForm";

// Text tone follows the sky behind it: night through beat 2, dawn from beat 3
// on wide screens. Narrow screens stack each beat's picture under its text, so
// beat 3's text still sits on the night sky there.
const beats: { title: string; body: string; tone: string }[] = [
  {
    title: "It checks the order first.",
    body: "Every message is read with the customer’s order, tracking and your store policies in hand.",
    tone: "m-tone-night",
  },
  {
    title: "Then it texts you.",
    body: "When a reply would change an order or move money, you get a text with the exact words first.",
    tone: "m-tone-night",
  },
  {
    title: "Reply yes, and it’s done.",
    body: "Shopkeeper makes the change in Shopify, then sends your customer the reply you approved.",
    tone: "m-tone-dusk",
  },
  {
    title: "Every step is on the record.",
    body: "What was asked, who approved it and what changed. When it can’t help, it says so and hands the conversation to you.",
    tone: "",
  },
];

export function Story() {
  return (
    <section aria-labelledby="hero-heading" className="m-story">
      <span aria-hidden data-nav-dark className="m-story-nightzone" />
      <div aria-hidden className="m-story-sky">
        <span className="m-story-stars" />
        <div className="m-story-dawn">
          <Image src="/atmosphere/footer-dawn.jpg" alt="" fill sizes="100vw" className="object-cover" />
        </div>
        <span className="m-story-grain m-grain" />
      </div>

      <div className="m-story-grid relative mx-auto grid px-5 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
        <div className="min-w-0">
          <div className="m-story-hero m-tone-night">
            <span aria-hidden data-nav-dark className="m-story-zone" />
            <div className="max-w-[36rem]">
              <h1 id="hero-heading" className="m-display m-hero-title max-w-[7.8em]">
                Customer support that texts you before it acts.
              </h1>
              <p className="m-lede mt-6 text-[1.125rem] sm:text-[1.1875rem]">
                Shopkeeper answers your Instagram DMs and emails using your real orders in Shopify. Routine
                questions get answered on their own. Changes and refunds wait for your yes.
              </p>
              <div id="waitlist" className="mt-9 scroll-mt-28">
                <WaitlistForm source="hero" dark />
              </div>
            </div>
            <div role="img" aria-label={STORY_SCENE_LABEL} className="mt-14 lg:hidden">
              <div aria-hidden>
                <InlineScene beat={0} />
              </div>
            </div>
          </div>

          <h2 className="sr-only">How it works</h2>
          {beats.map((beat, index) => {
            const number = (index + 1) as Beat;
            return (
              <div
                key={beat.title}
                id={number === 1 ? "how-it-works" : undefined}
                data-story-beat={number}
                className={cn("m-story-beat", beat.tone)}
              >
                {number <= 2 ? <span aria-hidden data-nav-dark className="m-story-zone" /> : null}
                {number === 3 ? <span aria-hidden data-nav-dark className="m-story-dusk-zone" /> : null}
                <div className="max-w-[27rem]">
                  <h3 className="m-display m-story-title">{beat.title}</h3>
                  <p className="m-lede mt-5 text-[1.1875rem]">{beat.body}</p>
                </div>
                <div aria-hidden className="mt-12 lg:hidden">
                  <InlineScene beat={number} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] items-center justify-center">
            <StoryStage />
          </div>
        </div>
      </div>
    </section>
  );
}
