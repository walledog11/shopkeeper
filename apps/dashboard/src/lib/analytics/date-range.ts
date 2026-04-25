export type DateRangePreset = '7d' | '30d' | '90d' | 'all' | 'custom'

export function getDateRangeFrom(preset: DateRangePreset, customFrom: string): Date {
  if (preset === 'all') return new Date('2020-01-01T00:00:00.000Z')

  const date = preset === 'custom' ? new Date(customFrom) : new Date()
  if (preset === '7d') date.setDate(date.getDate() - 7)
  if (preset === '30d') date.setDate(date.getDate() - 30)
  if (preset === '90d') date.setDate(date.getDate() - 90)
  date.setHours(0, 0, 0, 0)
  return date
}

export function getDateRangeTo(preset: DateRangePreset, customTo: string): Date {
  const date = preset === 'custom' ? new Date(customTo) : new Date()
  date.setHours(23, 59, 59, 999)
  return date
}
