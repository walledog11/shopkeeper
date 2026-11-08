import { describe, expect, it, vi } from 'vitest';
import { readStreamWithinLimit } from './bounded-stream.js';

function streamOf(chunks: string[], cancel = vi.fn()) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Buffer.from(chunk));
      controller.close();
    },
    cancel,
  });
}

describe('readStreamWithinLimit', () => {
  it('accepts the exact byte limit and releases the reader', async () => {
    const stream = streamOf(['ab', 'cd']);
    expect(await readStreamWithinLimit(stream, 4)).toEqual(Buffer.from('abcd'));
    expect(stream.locked).toBe(false);
  });

  it('rejects empty content', async () => {
    expect(await readStreamWithinLimit(streamOf([]), 4)).toBeNull();
  });

  it('cancels oversized content before retaining more chunks', async () => {
    const cancel = vi.fn();
    const stream = streamOf(['ab', 'cd', 'ef'], cancel);
    expect(await readStreamWithinLimit(stream, 3)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('charges a shared budget only for chunks within the individual limit', async () => {
    const consumeBytes = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const cancel = vi.fn();
    const stream = streamOf(['a', 'bc', 'd'], cancel);
    expect(await readStreamWithinLimit(stream, 10, { consumeBytes })).toBeNull();
    expect(consumeBytes.mock.calls).toEqual([[1], [2]]);
    expect(cancel).toHaveBeenCalledOnce();
    const tooLarge = vi.fn();
    expect(await readStreamWithinLimit(streamOf(['abc', 'd']), 2, { consumeBytes: tooLarge })).toBeNull();
    expect(tooLarge).not.toHaveBeenCalled();
  });

  it('preserves stream failures and releases the lock', async () => {
    const failure = new Error('read failed');
    const stream = new ReadableStream<Uint8Array>({ pull() { throw failure; } });
    await expect(readStreamWithinLimit(stream, 10)).rejects.toBe(failure);
    expect(stream.locked).toBe(false);
  });

  it('honors an aborted caller before reading', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const stream = streamOf(['a']);
    await expect(readStreamWithinLimit(stream, 10, { signal: controller.signal })).rejects.toBe(controller.signal.reason);
    expect(stream.locked).toBe(false);
  });
});
