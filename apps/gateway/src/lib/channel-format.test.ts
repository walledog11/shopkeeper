import { describe, expect, it } from 'vitest';
import { ChannelType } from '@shopkeeper/db';
import { formatChannelLabel } from './channel-format.js';

describe('formatChannelLabel', () => {
  it('formats Instagram DMs with the canonical label', () => {
    expect(formatChannelLabel(ChannelType.ig_dm)).toBe('Instagram DM');
  });

  it('capitalizes other channel types', () => {
    expect(formatChannelLabel(ChannelType.email)).toBe('Email');
    expect(formatChannelLabel(ChannelType.shopify)).toBe('Shopify');
  });
});
