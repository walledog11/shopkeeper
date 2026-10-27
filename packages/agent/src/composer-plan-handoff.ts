/**
 * The ticket composer's private ask hands an instruction to planning by calling
 * this tool, the way the dashboard chat opens a page with `navigate_dashboard`.
 * The model reads what the merchant wants; a verb list in the client used to,
 * and sent "Issue a refund" to the read-only ask because "issue" was not on it.
 */
export const DRAFT_PLAN_TOOL = "draft_plan";

export function handsOffToPlanning(actions: readonly { tool: string; status: string }[]): boolean {
  return actions.some((action) => action.tool === DRAFT_PLAN_TOOL && action.status === "success");
}
