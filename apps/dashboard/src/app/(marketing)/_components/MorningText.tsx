import { MorningPhone } from "./StoryVisuals";

export function MorningText() {
  return (
    <section
      aria-labelledby="morning-heading"
      className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20"
    >
      <div
        role="img"
        aria-label="A phone's lock screen at 7:00 AM with three texts from Shopkeeper: six things handled overnight with five needing no one, Riley's request to change the delivery address for #3107, and nine orders worth $684 since the last briefing."
        className="order-2 justify-self-center lg:order-1"
      >
        <div aria-hidden className="m-morning-phone">
          <MorningPhone />
        </div>
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
