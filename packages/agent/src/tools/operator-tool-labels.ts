/**
 * Display labels for the operator's module tools. The tools themselves live in
 * the gateway and never enter the shared registry; the gateway defines each one
 * from these labels and the dashboard shows them, so a step the merchant sees
 * never reads as a tool name.
 */
export const OPERATOR_TOOL_LABELS = {
  list_recent_changes: { label: "Read recent changes", planStepLabel: "Read recent changes" },
  navigate_dashboard: { label: "Opened dashboard page", planStepLabel: "Open dashboard page" },
  list_active_tickets: { label: "Listed active tickets", planStepLabel: "List active tickets" },
  get_ticket: { label: "Read ticket", planStepLabel: "Read ticket" },
  draft_ticket_reply: { label: "Drafted ticket reply", planStepLabel: "Draft ticket reply" },
  draft_email: { label: "Drafted email", planStepLabel: "Draft email" },
  mark_ticket_spam: { label: "Marked ticket as spam", planStepLabel: "Mark ticket as spam" },
  get_order_status: { label: "Checked order status", planStepLabel: "Check order status" },
  search_product_help: { label: "Searched product help", planStepLabel: "Search product help" },
  approve_pending_plan: { label: "Approved pending plan", planStepLabel: "Approve pending plan" },
  reject_pending_plan: { label: "Dismissed pending plan", planStepLabel: "Dismiss pending plan" },
  revise_pending_plan: { label: "Revised pending plan", planStepLabel: "Revise pending plan" },
  answer_operator_question: { label: "Recorded merchant answer", planStepLabel: "Record merchant answer" },
  create_flash_sale: { label: "Started a flash sale", planStepLabel: "Start flash sale" },
  list_flash_sales: { label: "Listed active flash sales", planStepLabel: "List active flash sales" },
  end_flash_sale: { label: "Ended a flash sale", planStepLabel: "End flash sale" },
  set_variant_prices: { label: "Repriced variants", planStepLabel: "Reprice variants" },
} as const satisfies Record<string, { label: string; planStepLabel: string }>;
