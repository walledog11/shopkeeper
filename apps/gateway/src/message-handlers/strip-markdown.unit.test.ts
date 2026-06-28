import { describe, it, expect } from 'vitest';
// Deterministic text transformation unit coverage.
import { stripMarkdown } from './strip-markdown.js';

describe('stripMarkdown', () => {
  it('removes emphasis markers', () => {
    expect(stripMarkdown('**bold** and *italic* and __also bold__ and ~~struck~~')).toBe(
      'bold and italic and also bold and struck',
    );
  });

  it('strips headers and blockquotes', () => {
    expect(stripMarkdown('## Refund policy\n\n> note this')).toBe('Refund policy\n\nnote this');
  });

  it('flattens links to text plus url', () => {
    expect(stripMarkdown('See [our policy](https://shop.example/policy) for details')).toBe(
      'See our policy (https://shop.example/policy) for details',
    );
  });

  it('unwraps inline code and fenced code blocks', () => {
    expect(stripMarkdown('Run `npm test` now')).toBe('Run npm test now');
    expect(stripMarkdown('```js\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('converts list markers to bullets', () => {
    expect(stripMarkdown('- one\n- two')).toBe('• one\n• two');
  });

  it('leaves snake_case identifiers and plain text untouched', () => {
    expect(stripMarkdown('order_id_value stays intact')).toBe('order_id_value stays intact');
    expect(stripMarkdown('Your order #1234 shipped today.')).toBe('Your order #1234 shipped today.');
  });

  it('returns an empty string unchanged', () => {
    expect(stripMarkdown('')).toBe('');
  });
});
