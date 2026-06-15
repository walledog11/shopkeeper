export function isQuestionableSender(filterStatus: string | null | undefined): boolean {
  return filterStatus === "questionable"
}

export function shouldSkipAutoPlan(filterStatus: string | null | undefined): boolean {
  return filterStatus === "questionable" || filterStatus === "filtered"
}

export function shouldBlockTrustedSendActions(filterStatus: string | null | undefined): boolean {
  return filterStatus === "questionable" || filterStatus === "filtered"
}
