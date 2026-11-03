import { describe, expect, it } from 'vitest';
import { blankAnswersFromMessage } from './operator-session-tools.js';

const calls = [
  { name: 'create_refund', input: { order_id: '1052' } },
  { name: 'send_reply', input: { text: 'It should reach you within {{refund_timing}}.' } },
];

// The words that fill a card's blank reach the customer, so they must be the
// merchant's own: an answer the model reworded, or one it invented, is refused.
describe('blankAnswersFromMessage', () => {
  it("takes the answer only from the merchant's message", () => {
    expect(blankAnswersFromMessage(calls, '1-2 business days', 'It should take 1-2 business days'))
      .toEqual({ answers: { refund_timing: '1-2 business days' } });
    expect(blankAnswersFromMessage(calls, '1 to 2 business days', 'It should take 1-2 business days'))
      .toHaveProperty('error');
    expect(blankAnswersFromMessage(calls, undefined, 'yes')).toHaveProperty('error');
  });

  it('needs no answer for a card without a blank', () => {
    expect(blankAnswersFromMessage([calls[0]!], undefined, 'yes')).toEqual({ answers: {} });
  });
});
