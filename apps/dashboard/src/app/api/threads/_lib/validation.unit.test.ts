import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import {
  parseBulkThreadPatchBody,
  parseShopifyThreadBody,
  parseThreadListQuery,
  parseThreadPatchBody,
} from './validation';

describe('thread API body validation', () => {
  it('rejects unknown thread patch fields', () => {
    expect(() => parseThreadPatchBody({ status: 'open', surprise: true })).toThrow(BadRequestError);
  });

  it('rejects invalid thread patch field types', () => {
    expect(() => parseThreadPatchBody({ tag: 42 })).toThrow(BadRequestError);
  });

  it('rejects malformed bulk thread ids', () => {
    expect(() => parseBulkThreadPatchBody({ ids: ['thread_1', 7], action: 'close' })).toThrow(BadRequestError);
  });

  it('requires a tag when bulk tagging threads', () => {
    expect(() => parseBulkThreadPatchBody({ ids: ['thread_1'], action: 'tag' })).toThrow(BadRequestError);
  });

  it('rejects unknown Shopify thread fields', () => {
    expect(() => parseShopifyThreadBody({
      shopifyCustomerId: 'gid://shopify/Customer/1',
      customerEmail: 'customer@example.com',
      extra: true,
    })).toThrow(BadRequestError);
  });
});

describe('thread list query validation', () => {
  it('applies documented defaults', () => {
    expect(parseThreadListQuery(new URLSearchParams())).toMatchObject({
      status: 'open',
      filterStatus: undefined,
      preview: false,
      countOnly: false,
      includeCount: false,
      cursor: undefined,
      limit: 50,
      needsReply: false,
      forMe: false,
      hasDraft: false,
      tag: undefined,
      channelType: undefined,
    });
  });

  it('parses supported enum, boolean, and limit values', () => {
    const query = new URLSearchParams({
      status: 'closed',
      filterStatus: 'filtered',
      preview: 'true',
      count: 'false',
      includeCount: 'true',
      limit: '100',
      needsReply: 'true',
      forMe: 'false',
      hasDraft: 'true',
      tag: 'Returns',
      channelType: 'email',
    });

    expect(parseThreadListQuery(query)).toMatchObject({
      status: 'closed',
      filterStatus: 'filtered',
      preview: true,
      countOnly: false,
      includeCount: true,
      limit: 100,
      needsReply: true,
      forMe: false,
      hasDraft: true,
      tag: 'Returns',
      channelType: 'email',
    });
  });

  it.each([
    ['status', 'pending'],
    ['status', 'anything'],
    ['filterStatus', 'genuine'],
    ['preview', 'yes'],
    ['count', '1'],
    ['includeCount', 'TRUE'],
    ['needsReply', ''],
    ['forMe', 'null'],
    ['hasDraft', 'no'],
    ['tag', 'General'],
    ['channelType', 'whatsapp'],
    ['limit', '0'],
    ['limit', '101'],
    ['limit', '2.5'],
    ['limit', '2items'],
  ])('rejects invalid %s=%s', (field, value) => {
    expect(() => parseThreadListQuery(new URLSearchParams({ [field]: value }))).toThrow(BadRequestError);
  });

  it('rejects a malformed cursor', () => {
    expect(() => parseThreadListQuery(new URLSearchParams({ cursor: 'not-a-cursor' }))).toThrow(BadRequestError);
  });
});
