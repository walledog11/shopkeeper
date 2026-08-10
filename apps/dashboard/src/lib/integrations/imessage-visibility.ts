export function normalizeImessageLineHandle(raw: string | undefined | null): string | null {
  const value = raw?.trim()
  return value && value.length > 0 ? value : null
}
