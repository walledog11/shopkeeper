import { Bubble, ChatPanel, Stamp } from "./Chat";
import { WaitlistForm } from "./WaitlistForm";

// The approval text follows the card the product sends (`formatOperatorPlanMessage`
// in the gateway): the request, what it would do, the exact reply, then the question.
function HeroDemo() {
  return (
    <div
      role="img"
      aria-label="Maya messages a store on Instagram at 2:14 AM asking to swap her jumpsuit from a Medium to a Small. Shopkeeper texts the owner the exact reply it would send and asks OK to go ahead. At 7:02 AM the owner replies yes, the order is updated in Shopify, and Maya gets her answer."
      className="m-demo"
    >
      <ChatPanel app="instagram" name="Maya Chen" initials="MC" className="m-demo-customer">
        <Stamp>2:14 AM</Stamp>
        <Bubble from="them" delay="[animation-delay:300ms]">hi! I ordered the linen jumpsuit in M but I need an S</Bubble>
        <Bubble from="them" delay="[animation-delay:800ms]">can you switch it before it ships?</Bubble>
        <Stamp delay="[animation-delay:3.4s]">7:02 AM</Stamp>
        <Bubble from="me" delay="[animation-delay:4.4s]">Done! Your order #3102 is now a Small, same price.</Bubble>
        <Bubble from="them" delay="[animation-delay:5.2s]">omg thank you!!</Bubble>
      </ChatPanel>

      <ChatPanel app="imessage" name="Shopkeeper" initials="S" className="m-demo-owner">
        <Stamp delay="[animation-delay:1.5s]">2:14 AM</Stamp>
        <Bubble from="them" wide delay="[animation-delay:1.7s]">
          <span className="block">Maya Chen asked to swap her linen jumpsuit from M to S on #3102. It hasn’t shipped, and the Small is in stock.</span>
          <span className="mt-2 block">I’d swap the Medium for the Small, then reply on Instagram:</span>
          <span className="mt-2 block">“Done! Your order #3102 is now a Small, same price.”</span>
          <span className="mt-2 block">OK to go ahead?</span>
        </Bubble>
        <Stamp delay="[animation-delay:3.4s]">7:02 AM</Stamp>
        <Bubble from="me" delay="[animation-delay:3.6s]">yes</Bubble>
        <Bubble from="them" delay="[animation-delay:4.1s]">Done. #3102 is updated in Shopify, and Maya has her reply.</Bubble>
      </ChatPanel>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-12 lg:pb-28 lg:pt-24">
      <div className="max-w-[36rem]">
        <h1 className="m-display m-hero-title max-w-[7.8em]">Customer support that texts you before it acts.</h1>
        <p className="m-lede mt-6 text-[1.125rem] sm:text-[1.1875rem]">
          Shopkeeper answers your Instagram DMs and emails using your real orders in Shopify. Routine
          questions get answered on their own. Changes and refunds wait for your yes.
        </p>
        <div id="waitlist" className="mt-9 scroll-mt-28">
          <WaitlistForm source="hero" />
        </div>
      </div>
      <HeroDemo />
    </section>
  );
}
