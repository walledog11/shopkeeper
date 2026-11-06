const groups = [
  {
    title: "Answers on its own",
    body: "Order status, tracking, sizing and policy questions, in your voice.",
    asks: ["Where’s my order?", "What’s your return window?", "Does the linen jumpsuit run small?"],
  },
  {
    title: "Texts you first",
    body: "By default, order changes and refunds wait for your yes.",
    asks: ["Can I switch to a small before it ships?", "My order arrived damaged.", "Can I get a refund?"],
  },
  {
    title: "Hands it to you",
    body: "When it can’t help, it says so and leaves the conversation to you.",
    asks: ["Can I speak to the owner?", "Could you make a custom size for my wedding?"],
  },
] as const;

export function Handles() {
  return (
    <section id="how-it-works" aria-labelledby="handles-heading" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <h2 id="handles-heading" className="m-display m-h2">It knows when to ask.</h2>
        <p className="m-lede mt-5 text-[1.125rem]">
          Every message is read with the customer’s order, tracking and your store policies in hand.
        </p>
      </div>

      <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[1.0625rem] font-medium text-[color:var(--m-ink)]">{group.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--m-ink-2)]">{group.body}</p>
            <ul className="mt-6 flex flex-col items-start gap-2">
              {group.asks.map((ask) => (
                <li key={ask} className="m-ask">{ask}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
