export type ViewId = 'all' | 'open' | 'resolved' | 'recent'

export interface NavView {
  id: ViewId
  label: string
  count: number
}
