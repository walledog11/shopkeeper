import type { CannedResponse } from "@/types"

export interface FormState { title: string; body: string; tags: string[] }

export const emptyForm = (): FormState => ({ title: "", body: "", tags: [] })

export const formFrom = (response: CannedResponse): FormState => ({
  title: response.title,
  body: response.body,
  tags: [...(response.tags ?? [])],
})
