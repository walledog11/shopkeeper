export type ProgressKind = 'plan-run' | 'free-form' | 'digest-reply';

export interface ProgressContext {
  kind: ProgressKind;
  orderNumber?: string | null;
  instruction?: string;
  ticketIndex?: number;
}

export function buildProgressCopy(progress: ProgressContext): string {
  switch (progress.kind) {
    case 'plan-run':
      return progress.orderNumber
        ? `Running the approved plan for ${progress.orderNumber}…`
        : 'Running the approved plan…';
    case 'free-form':
      return 'Working on that…';
    case 'digest-reply':
      return progress.ticketIndex != null
        ? `Sending your reply on ticket ${progress.ticketIndex}…`
        : 'Sending your reply…';
  }
}
