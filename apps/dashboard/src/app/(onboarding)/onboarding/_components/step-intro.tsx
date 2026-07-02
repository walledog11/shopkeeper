import { Input } from "@/components/ui/input";
import { PRODUCT_NAME } from "@/lib/brand";
import { Accent, Field, Headline, Lede } from "./primitives";
import type { OnboardingData } from "./model";

export function StepIntro({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Headline>
        Customer support, handled.
        <Accent>You approve before anything sends.</Accent>
      </Headline>
      <Lede>
        {PRODUCT_NAME} reads each message, checks the order in Shopify, and drafts the next step —
        then waits for your okay.
      </Lede>

      <div className="mt-6 w-full max-w-[420px] space-y-2">
        <ChatBubble side="in">Where&apos;s my order #1048?</ChatBubble>
        <ChatBubble side="out">On its way — arriving Friday. Want me to send the tracking link?</ChatBubble>
      </div>

      <div className="mt-6 w-full max-w-[420px] space-y-3.5">
        <Field label="Store name" required>
          <Input
            autoFocus
            value={data.storeName}
            onChange={event => update({ storeName: event.target.value })}
            placeholder="Oat Milk Co."
            className="h-11 border-foreground/12 bg-transparent text-[16px] text-foreground placeholder:text-foreground/30 focus-visible:border-foreground/30 focus-visible:ring-foreground/15"
          />
        </Field>
        <Field label="Your first name" required hint="Used in your briefings, never in customer replies.">
          <Input
            value={data.founderName}
            onChange={event => update({ founderName: event.target.value })}
            placeholder="Willa"
            className="h-11 border-foreground/12 bg-transparent text-[16px] text-foreground placeholder:text-foreground/30 focus-visible:border-foreground/30 focus-visible:ring-foreground/15"
          />
        </Field>
      </div>

      <p className="mt-5 max-w-[420px] text-[12.5px] leading-relaxed text-foreground/45">
        Every reply and Shopify action is recorded, and you start in approval mode — nothing goes out without you.
      </p>
    </div>
  );
}

// The one place green is allowed: authentic chat chrome. Cream text on a green
// send bubble reads as the merchant's Telegram/Messages thread.
function ChatBubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  if (side === "in") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-foreground/[0.05] px-3.5 py-2 text-[14px] leading-snug text-foreground/80">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-green-600 px-3.5 py-2 text-[14px] leading-snug text-[#f6f2eb]">
        {children}
      </div>
    </div>
  );
}
