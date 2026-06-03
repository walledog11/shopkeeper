import type { PlaybookAction, PlaybookActionType, PlaybookTrigger, PlaybookTriggerType } from "@/types"

export const TICKET_TAGS = ["Shipping", "Returns", "Order Status", "Product Inquiry", "General"]

export const TRIGGER_LABELS: Record<PlaybookTriggerType, string> = {
  new_ticket: "A new ticket is received",
  tag_applied: "A tag is applied",
  ticket_closed: "A ticket is closed",
}

export const ACTION_LABELS: Record<PlaybookActionType, string> = {
  send_reply: "Send a reply",
  apply_tag: "Apply a tag",
  close_ticket: "Close the ticket",
  add_note: "Add an internal note",
}

export const ACTION_CHIP_CLS: Record<PlaybookActionType, string> = {
  send_reply: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  apply_tag: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  close_ticket: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  add_note: "bg-amber-500/15 text-amber-400 border-amber-500/25",
}

export const TEMPLATES: Array<{ name: string; trigger: PlaybookTrigger; actions: PlaybookAction[] }> = [
  {
    name: "WISMO Auto-Reply",
    trigger: { type: "tag_applied", tag: "Shipping" },
    actions: [
      { type: "send_reply", message: "Hi! I can see you have a question about your shipment. Let me look into that for you right away , could you confirm your order number so I can give you the most up-to-date info?" },
    ],
  },
  {
    name: "Returns & Refunds",
    trigger: { type: "tag_applied", tag: "Returns" },
    actions: [
      { type: "send_reply", message: "Hi! Thanks for reaching out about a return. We're happy to help. Please share your order details and the reason for your return and we'll get back to you quickly." },
    ],
  },
  {
    name: "Auto-close Resolved",
    trigger: { type: "ticket_closed" },
    actions: [
      { type: "send_reply", message: "Thanks for reaching out! We're glad we could help. If you have any other questions feel free to contact us anytime." },
      { type: "add_note", note: "Ticket auto-closed by playbook." },
    ],
  },
]

export type PlaybookTemplate = typeof TEMPLATES[number]

export function triggerChipText(trigger: PlaybookTrigger): string {
  if (trigger.type === "new_ticket") return "When new ticket"
  if (trigger.type === "tag_applied") return `When tag applied = ${trigger.tag ?? "any"}`
  return "When ticket closed"
}

export function generateDescription(trigger: PlaybookTrigger, actions: PlaybookAction[]): string {
  const parts = actions.map(action => ACTION_LABELS[action.type].toLowerCase()).join(" + ")
  if (trigger.type === "tag_applied") return `On '${trigger.tag}' tag, ${parts}.`
  if (trigger.type === "new_ticket") return `On new tickets, ${parts}.`
  return `On ticket close, ${parts}.`
}

export function triggerSummary(trigger: PlaybookTrigger): string {
  if (trigger.type === "tag_applied") return `Tag: ${trigger.tag ?? "any"}`
  return TRIGGER_LABELS[trigger.type]
}

export function actionSummary(actions: PlaybookAction[]): string {
  if (actions.length === 0) return "No actions"
  return actions.map(action => ACTION_LABELS[action.type]).join(" · ")
}

export function emptyTrigger(): PlaybookTrigger {
  return { type: "tag_applied", tag: TICKET_TAGS[0] }
}

export function emptyAction(): PlaybookAction {
  return { type: "send_reply", message: "" }
}
