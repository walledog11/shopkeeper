import { describe, expect, it } from 'vitest';
import {
  classifyOrder,
  financialPill,
  fulfillmentPill,
  lineItemsSummary,
  orderItemCount,
  type OrderRow,
} from './orders-board-model';

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1001,
    name: '#1001',
    created_at: '2026-06-27T12:00:00.000Z',
    financial_status: 'paid',
    fulfillment_status: null,
    total_price: '50.00',
    customer: { id: 1, name: 'Alex', email: 'alex@example.com' },
    line_items: [{ title: 'Hat', quantity: 2, variant_title: 'Blue' }],
    ...overrides,
  };
}

describe('orders board model', () => {
  it.each([
    [{ financial_status: 'refunded' }, 'refunded'],
    [{ financial_status: 'authorized' }, 'unpaid'],
    [{ financial_status: 'paid', fulfillment_status: 'partial' }, 'needs_fulfillment'],
    [{ financial_status: 'paid', fulfillment_status: 'fulfilled' }, 'fulfilled'],
  ] as const)('classifies overlapping order state once', (overrides, expected) => {
    expect(classifyOrder(order(overrides))).toBe(expected);
  });

  it('maps financial and fulfillment status pills', () => {
    expect(financialPill('paid')).toEqual({ label: 'Paid', tone: 'positive' });
    expect(financialPill('partially_refunded')).toEqual({ label: 'Partial refund', tone: 'info' });
    expect(financialPill('custom')).toEqual({ label: 'custom', tone: 'muted' });
    expect(fulfillmentPill('partial')).toEqual({ label: 'Partially fulfilled', tone: 'warn' });
    expect(fulfillmentPill(null)).toEqual({ label: 'Unfulfilled', tone: 'warn' });
  });

  it('summarizes line items and totals quantities', () => {
    const fixture = order({
      line_items: [
        { title: 'Hat', quantity: 2, variant_title: 'Blue' },
        { title: 'Shirt', quantity: 1, variant_title: null },
        { title: 'Sticker', quantity: 3, variant_title: null },
      ],
    });

    expect(lineItemsSummary(fixture.line_items)).toBe('2× Hat · 1× Shirt · +1 more');
    expect(orderItemCount(fixture)).toBe(6);
    expect(lineItemsSummary([])).toBeNull();
  });
});
