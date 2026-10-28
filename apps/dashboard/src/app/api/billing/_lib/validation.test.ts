import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import { parseCheckoutBody } from './validation';

describe('billing API body validation', () => {
  it('requires a tier string', () => {
    expect(() => parseCheckoutBody({ tier: 7 })).toThrow(BadRequestError);
  });

  it('normalizes the tier value', () => {
    expect(parseCheckoutBody({ tier: ' starter ' })).toEqual({ tier: 'starter' });
  });
});
