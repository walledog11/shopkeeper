import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import {
  parseBulkThreadPatchBody,
  parseShopifyThreadBody,
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
