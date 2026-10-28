import { describe, expect, it } from 'vitest';
import { BadRequestError } from '@/lib/api/errors';
import {
  readEmptyJsonBody,
  readOptionalJsonObject,
  readRequiredJsonObject,
} from '@/lib/api/body';

describe('api JSON body helpers', () => {
  it('maps malformed JSON to BadRequestError', async () => {
    await expect(readRequiredJsonObject(request('{'))).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects empty required bodies', async () => {
    await expect(readRequiredJsonObject(request(''))).rejects.toMatchObject({
      message: 'Request body is required',
      status: 400,
    });
  });

  it('rejects primitive JSON when an object is required', async () => {
    await expect(readRequiredJsonObject(request('"nope"'))).rejects.toMatchObject({
      message: 'Validation failed',
      status: 400,
    });
  });

  it('allows optional empty object bodies', async () => {
    await expect(readOptionalJsonObject(request(''))).resolves.toBeUndefined();
  });

  it('rejects non-empty bodies for empty-body routes', async () => {
    await expect(readEmptyJsonBody(request('{"extra":true}'))).rejects.toMatchObject({
      message: 'Request body must be empty',
      status: 400,
    });
  });
});

function request(body: string) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body,
  });
}
