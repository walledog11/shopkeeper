import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import { parseTeamInviteBody } from './validation';

describe('team API body validation', () => {
  it('requires an email string', () => {
    expect(() => parseTeamInviteBody({ emailAddress: 7 })).toThrow(BadRequestError);
  });

  it('falls back to member for unsupported roles', () => {
    expect(parseTeamInviteBody({ emailAddress: ' user@example.com ', role: 'owner' })).toEqual({
      emailAddress: 'user@example.com',
      role: 'org:member',
    });
  });
});
