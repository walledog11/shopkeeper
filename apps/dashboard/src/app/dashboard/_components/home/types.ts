export type ViewId = 'open' | 'resolved' | 'recent'

export interface NavView {
  id: ViewId
  label: string
  count: number
}
