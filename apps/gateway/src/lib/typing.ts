export { isRecord } from '@shopkeeper/agent/guards';

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
