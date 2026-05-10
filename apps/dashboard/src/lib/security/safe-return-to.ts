export function safeReturnTo(raw: string | null | undefined): string | null {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}
