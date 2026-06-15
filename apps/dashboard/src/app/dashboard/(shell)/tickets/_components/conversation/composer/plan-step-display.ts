import type { AgentPlan, PlanStep } from "@/types"

export function formatPlanStepSentence(step: PlanStep, customerName?: string | null): string {
  const firstName = customerName?.trim().split(/\s+/)[0]

  if (step.tool === "send_reply") {
    const reply = step.description?.replace(/^"|"$/g, "").trim()
    if (reply && firstName) return `Reply to ${firstName}: "${reply}"`
    if (reply) return `Reply: "${reply}"`
    return "Send a reply to the customer"
  }

  if (step.tool === "send_email") {
    if (step.description) return step.description
    return firstName ? `Email ${firstName}` : "Email the customer"
  }

  if (step.tool === "update_thread_status") {
    const status = step.description?.match(/Set status to (\w+)/i)?.[1]?.toLowerCase()
    if (status === "closed" || status === "resolved") return "Close the ticket"
  }

  if (step.description) return step.description
  return step.label
}

export function getPlanApproveLabel(steps: Array<PlanStep & { enabled: boolean }>): string {
  const enabled = steps.filter((step) => step.enabled)
  const replyOnly =
    enabled.length === 1 &&
    enabled[0].tool === "send_reply"

  return replyOnly ? "Send reply" : "Do this"
}

export function getPlanCollapsedPreview(plan: AgentPlan): string | null {
  const replyStep = plan.steps.find((step) => step.tool === "send_reply")
  if (replyStep?.description) {
    return replyStep.description.replace(/^"|"$/g, "").trim() || null
  }

  const firstStep = plan.steps[0]
  if (!firstStep) return null
  return formatPlanStepSentence(firstStep)
}
