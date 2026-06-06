import { BadRequestError } from '@/lib/api/errors';
import { requireJsonObject } from '@/lib/api/body';
import type { ShopifyCustomerUpdates } from './customer-service';

function parseCustomerId(value: unknown): string | number {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new BadRequestError('Missing customerId or updates');
}

export function parseShopifyCustomerUpdateBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  const { customerId, updates } = candidate;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new BadRequestError('Missing customerId or updates');
  }

  return {
    customerId: parseCustomerId(customerId),
    updates: updates as ShopifyCustomerUpdates,
  };
}

export function parseCreateShopifyCustomerBody(body: unknown) {
  const candidate = requireJsonObject(body, { message: 'Validation failed' });
  const { first_name, last_name, email } = candidate;

  return {
    first_name: typeof first_name === 'string' ? first_name : '',
    last_name: typeof last_name === 'string' ? last_name : '',
    email: typeof email === 'string' ? email : undefined,
  };
}
