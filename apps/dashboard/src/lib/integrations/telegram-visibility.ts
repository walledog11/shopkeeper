export function normalizeTelegramBotUsername(raw: string | undefined | null): string | null {
  const value = raw?.trim().replace(/^@+/, "")
  return value && value.length > 0 ? value : null
}
