import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { classifyPerson, personObject } from '@shopkeeper/agent/person-name';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { listConfirmedOrders } from '../../storefront-chat-verified-orders.js';
import { rowRequestFacts } from './request-facts.js';

export interface PhotoWait {
  threadId: string;
  /** Who owes the photo, as the briefing names people mid-sentence. */
  person: string;
  /** The order the claim is about, confirmed by the customer when they did. */
  order: string | null;
}

/**
 * Damage claims stalled on the customer's photo. Other waits on a customer stay
 * out of the briefing as ordinary lifecycle, but this one holds a claim, and the
 * money on it, open until the customer answers. "Still waiting" is the planner's
 * own reading of the thread: the ask is recorded and no customer attachment has
 * arrived since it (the damage-evidence query in `buildContext`).
 */
export async function loadPhotoWaits(organizationId: string): Promise<PhotoWait[]> {
  const threads = await db.thread.findMany({
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      status: 'open',
      awaitingCustomer: 'damage_photo',
      awaitingCustomerSince: { not: null },
    },
    orderBy: [{ awaitingCustomerSince: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      channelType: true,
      classifierSignals: true,
      awaitingCustomerSince: true,
      customer: { select: { name: true } },
      messages: {
        where: { senderType: SENDER_TYPE.CUSTOMER, deletedAt: null, attachments: { isEmpty: false } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { sentAt: true },
      },
    },
  });
  const waiting = threads.filter((thread) => {
    const latestAttachment = thread.messages[0];
    return !latestAttachment || !thread.awaitingCustomerSince
      || latestAttachment.sentAt <= thread.awaitingCustomerSince;
  });
  return Promise.all(waiting.map(async (thread) => {
    const confirmed = (await listConfirmedOrders(organizationId, thread.id, thread.channelType))
      .map((order) => order.orderName);
    const order = confirmed[0] ?? rowRequestFacts(thread)?.order ?? null;
    const person = classifyPerson({
      customerName: thread.customer?.name,
      channelType: thread.channelType,
      verifiedOrders: confirmed,
      followingText: order ?? '',
    });
    return { threadId: thread.id, person: personObject(person), order };
  }));
}

/** "Waiting on a photo from Dana (#1038)." — composed from the fields alone. */
export function formatPhotoWaitLine(waits: readonly PhotoWait[]): string | null {
  if (waits.length === 0) return null;
  const parts = waits.map((wait) => (wait.order ? `${wait.person} (${wait.order})` : wait.person));
  const listed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `Waiting on ${waits.length === 1 ? 'a photo' : 'photos'} from ${listed}.`;
}
