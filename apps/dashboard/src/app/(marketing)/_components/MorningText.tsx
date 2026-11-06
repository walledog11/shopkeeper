import { Bubble, ChatPanel, Stamp } from "./Chat";

// Briefing lines in the gateway's own wording (`formatHandledSection`,
// `formatSalesPulseLine`), with a store question answered after it.
export function MorningText() {
  return (
    <section
      aria-labelledby="morning-heading"
      className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20"
    >
      <div
        role="img"
        aria-label="A 7 AM text from Shopkeeper: six things handled overnight, one address change waiting, and nine orders since the last briefing. The owner asks how many sand jumpsuits are left in small, and Shopkeeper answers 12."
        className="order-2 w-full max-w-[26rem] justify-self-center lg:order-1 lg:justify-self-start"
      >
        <ChatPanel app="imessage" name="Shopkeeper" initials="S">
          <Stamp>Today 7:00 AM</Stamp>
          <Bubble from="them" wide>
            Since your last briefing I handled six things, including four replies and a refund. Five of
            those ran without needing you.
          </Bubble>
          <Bubble from="them" wide>Riley asked to change the delivery address for #3107.</Bubble>
          <Bubble from="them" wide>
            9 orders and $684 since your last briefing. This time last week it was 6 orders and $455.
          </Bubble>
          <Stamp>7:04 AM</Stamp>
          <Bubble from="me">how many sand jumpsuits in small?</Bubble>
          <Bubble from="them">12 in Small / Sand.</Bubble>
        </ChatPanel>
      </div>

      <div className="order-1 max-w-xl lg:order-2">
        <h2 id="morning-heading" className="m-display m-h2">A text every morning.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">
          What it handled overnight, what’s waiting on you and how sales are going. Reply to ask about
          anything in your store.
        </p>
      </div>
    </section>
  );
}
