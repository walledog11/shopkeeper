/** Read a nonempty byte stream, cancelling it as soon as its budget is exceeded. */
export async function readStreamWithinLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  options: {
    signal?: AbortSignal;
    consumeBytes?: (bytes: number) => boolean;
  } = {},
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes || options.consumeBytes?.(value.byteLength) === false) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return byteLength > 0 ? Buffer.concat(chunks, byteLength) : null;
  } finally {
    reader.releaseLock();
  }
}
