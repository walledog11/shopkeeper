import {
  ChannelType,
  ThreadFilterFeedback,
  ThreadFilterStatus,
  type DbChannelType,
} from '@shopkeeper/db';
import { THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import { assertKnownFields, requireNonEmptyString } from '@/lib/api/validation';
import { decodeThreadCursor, type ThreadCursor } from '@/lib/messaging/thread-list-query';

const THREAD_PATCH_FIELDS = ['status', 'tag', 'shopifyCustomerId', 'filterStatus', 'filterFeedback'];
const BULK_THREAD_PATCH_FIELDS = ['ids', 'action', 'tag'];
const SHOPIFY_THREAD_FIELDS = ['shopifyCustomerId', 'customerEmail', 'customerName', 'orderName'];
const BULK_THREAD_ACTIONS = ['close', 'open', 'tag', 'archive'] as const;
const THREAD_LIST_STATUSES = [THREAD_STATUS.OPEN, THREAD_STATUS.CLOSED] as const;
const THREAD_LIST_TAGS = new Set(['Shipping', 'Returns', 'Order Status', 'Product Inquiry']);
const THREAD_LIST_CHANNEL_TYPES = new Set<DbChannelType>(Object.values(ChannelType));
const DEFAULT_THREAD_PAGE_SIZE = 50;
const MAX_THREAD_PAGE_SIZE = 100;

type ThreadListStatus = typeof THREAD_LIST_STATUSES[number];

function parseThreadListStatus(value: string | null): ThreadListStatus {
  const status = value ?? THREAD_STATUS.OPEN;
  if (!THREAD_LIST_STATUSES.includes(status as ThreadListStatus)) {
    throw new BadRequestError('Invalid status');
  }
  return status as ThreadListStatus;
}

function parseThreadListFilterStatus(value: string | null): typeof ThreadFilterStatus.filtered | undefined {
  if (value === null) return undefined;
  if (value !== ThreadFilterStatus.filtered) {
    throw new BadRequestError('Invalid filterStatus');
  }
  return value;
}

function parseThreadListBoolean(searchParams: URLSearchParams, field: string): boolean {
  const value = searchParams.get(field);
  if (value === null) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestError(`Invalid ${field}`);
}

function parseThreadListLimit(value: string | null): number {
  if (value === null) return DEFAULT_THREAD_PAGE_SIZE;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestError('Invalid limit');
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_THREAD_PAGE_SIZE) {
    throw new BadRequestError(`limit must be between 1 and ${MAX_THREAD_PAGE_SIZE}`);
  }
  return limit;
}

function parseThreadListTag(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (!THREAD_LIST_TAGS.has(value)) {
    throw new BadRequestError('Invalid tag');
  }
  return value;
}

function parseThreadListChannelType(value: string | null): DbChannelType | undefined {
  if (value === null) return undefined;
  if (!THREAD_LIST_CHANNEL_TYPES.has(value as DbChannelType)) {
    throw new BadRequestError('Invalid channelType');
  }
  return value as DbChannelType;
}

export function parseThreadListQuery(searchParams: URLSearchParams) {
  const rawCursor = searchParams.get('cursor');
  let cursor: ThreadCursor | undefined;
  if (rawCursor !== null) {
    const decodedCursor = decodeThreadCursor(rawCursor);
    if (!decodedCursor) {
      throw new BadRequestError('Invalid cursor');
    }
    cursor = decodedCursor;
  }

  return {
    status: parseThreadListStatus(searchParams.get('status')),
    filterStatus: parseThreadListFilterStatus(searchParams.get('filterStatus')),
    preview: parseThreadListBoolean(searchParams, 'preview'),
    countOnly: parseThreadListBoolean(searchParams, 'count'),
    includeCount: parseThreadListBoolean(searchParams, 'includeCount'),
    cursor,
    limit: parseThreadListLimit(searchParams.get('limit')),
    needsReply: parseThreadListBoolean(searchParams, 'needsReply'),
    forMe: parseThreadListBoolean(searchParams, 'forMe'),
    hasDraft: parseThreadListBoolean(searchParams, 'hasDraft'),
    tag: parseThreadListTag(searchParams.get('tag')),
    channelType: parseThreadListChannelType(searchParams.get('channelType')),
  };
}

export type BulkThreadAction = typeof BULK_THREAD_ACTIONS[number];

function parseOptionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestError(`${field} must be a string`);
  }
  return value;
}

function parseOptionalTrimmedString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOptionalThreadStatus(value: unknown) {
  if (value === undefined) return undefined;
  if (!Object.values(THREAD_STATUS).includes(value as typeof THREAD_STATUS[keyof typeof THREAD_STATUS])) {
    throw new BadRequestError('Invalid status');
  }
  return value as typeof THREAD_STATUS[keyof typeof THREAD_STATUS];
}

function parseOptionalFilterStatus(value: unknown): ThreadFilterStatus | undefined {
  if (value === undefined) return undefined;
  if (!Object.values(ThreadFilterStatus).includes(value as ThreadFilterStatus)) {
    throw new BadRequestError('Invalid filterStatus');
  }
  return value as ThreadFilterStatus;
}

function parseOptionalFilterFeedback(value: unknown): ThreadFilterFeedback | undefined {
  if (value === undefined) return undefined;
  if (!Object.values(ThreadFilterFeedback).includes(value as ThreadFilterFeedback)) {
    throw new BadRequestError('Invalid filterFeedback');
  }
  return value as ThreadFilterFeedback;
}

export function parseThreadPatchBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  assertKnownFields(candidate, THREAD_PATCH_FIELDS);

  const parsed = {
    status: parseOptionalThreadStatus(candidate.status),
    tag: parseOptionalNullableString(candidate.tag, 'tag'),
    shopifyCustomerId: parseOptionalNullableString(candidate.shopifyCustomerId, 'shopifyCustomerId'),
    filterStatus: parseOptionalFilterStatus(candidate.filterStatus),
    filterFeedback: parseOptionalFilterFeedback(candidate.filterFeedback),
  };

  if (
    parsed.status === undefined &&
    parsed.tag === undefined &&
    parsed.shopifyCustomerId === undefined &&
    parsed.filterStatus === undefined &&
    parsed.filterFeedback === undefined
  ) {
    throw new BadRequestError('Missing status, tag, shopifyCustomerId, filterStatus, or filterFeedback');
  }

  return parsed;
}

function parseThreadIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError('Missing ids');
  }
  if (value.length > 100) {
    throw new BadRequestError('Too many ids — max 100 per request');
  }
  if (value.some(id => typeof id !== 'string' || !id.trim())) {
    throw new BadRequestError('ids must contain thread ids');
  }
  return value.map(id => id.trim());
}

function parseBulkAction(value: unknown): BulkThreadAction {
  if (!BULK_THREAD_ACTIONS.includes(value as BulkThreadAction)) {
    throw new BadRequestError('Invalid action');
  }
  return value as BulkThreadAction;
}

export function parseBulkThreadPatchBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  assertKnownFields(candidate, BULK_THREAD_PATCH_FIELDS);

  const ids = parseThreadIds(candidate.ids);
  const action = parseBulkAction(candidate.action);
  const tag = parseOptionalNullableString(candidate.tag, 'tag');
  if (action === 'tag' && tag === undefined) {
    throw new BadRequestError('tag is required');
  }

  return { ids, action, tag };
}

export function parseShopifyThreadBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Invalid request body' });
  assertKnownFields(candidate, SHOPIFY_THREAD_FIELDS);

  return {
    shopifyCustomerId: requireNonEmptyString(
      candidate.shopifyCustomerId,
      'shopifyCustomerId',
      'Missing shopifyCustomerId or customerEmail',
    ),
    customerEmail: requireNonEmptyString(
      candidate.customerEmail,
      'customerEmail',
      'Missing shopifyCustomerId or customerEmail',
    ),
    customerName: parseOptionalTrimmedString(candidate.customerName, 'customerName'),
    orderName: parseOptionalTrimmedString(candidate.orderName, 'orderName'),
  };
}
