import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }));

vi.mock("@vercel/blob", () => ({ get: getSpy }));

import { hydrateAgentMessageImages } from "./image-attachments.js";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function streamOf(data: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

function blobResult(data: Buffer, contentType: string, size = data.byteLength) {
  return {
    statusCode: 200,
    stream: streamOf(data),
    blob: { contentType, size },
  };
}

beforeEach(() => {
  getSpy.mockReset();
});

describe("hydrateAgentMessageImages", () => {
  it("loads a workspace-owned private image as bounded base64 model data", async () => {
    const reference = `blob:attachments/${ORG_ID}/image-id/photo.png`;
    getSpy.mockResolvedValueOnce(blobResult(PNG, "image/png"));

    const messages = await hydrateAgentMessageImages(ORG_ID, [{
      senderType: "customer",
      contentText: "[Instagram image attachment]",
      attachmentRefs: [reference],
    }]);

    expect(messages[0]).toEqual({
      senderType: "customer",
      contentText: "[Instagram image attachment]",
      attachments: [{
        type: "image",
        reference,
        status: "available",
        mediaType: "image/png",
        data: PNG.toString("base64"),
      }],
    });
    expect(getSpy).toHaveBeenCalledWith(
      `attachments/${ORG_ID}/image-id/photo.png`,
      expect.objectContaining({
        access: "private",
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects cross-workspace, malformed, public, and non-image references before blob access", async () => {
    const messages = await hydrateAgentMessageImages(ORG_ID, [{
      senderType: "customer",
      contentText: "attachments",
      attachmentRefs: [
        "blob:attachments/00000000-0000-0000-0000-000000000002/image-id/cross.png",
        `blob:attachments/${ORG_ID}/image-id/../malformed.png`,
        `https://public.blob.vercel-storage.com/attachments/${ORG_ID}/image-id/public.png`,
        `blob:attachments/${ORG_ID}/file-id/receipt.pdf`,
      ],
    }]);

    expect(messages[0]?.attachments).toEqual([
      expect.objectContaining({ status: "unavailable" }),
      expect.objectContaining({ status: "unavailable" }),
      expect.objectContaining({ status: "unavailable" }),
    ]);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("rejects missing, non-image, MIME-mismatched, and oversized private blobs", async () => {
    getSpy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(blobResult(PNG, "text/plain"))
      .mockResolvedValueOnce(blobResult(JPEG, "image/png"))
      .mockResolvedValueOnce(blobResult(PNG, "image/png", 6 * 1024 * 1024));

    const messages = await hydrateAgentMessageImages(ORG_ID, [{
      senderType: "customer",
      contentText: "attachments",
      attachmentRefs: ["missing", "wrong-type", "wrong-magic", "oversized"].map(
        (id) => `blob:attachments/${ORG_ID}/${id}/photo.png`,
      ),
    }]);

    expect(messages[0]?.attachments).toHaveLength(4);
    expect(messages[0]?.attachments?.every((attachment) => attachment.status === "unavailable")).toBe(true);
  });

  it("rejects a stream that exceeds its declared and configured byte limit", async () => {
    getSpy.mockResolvedValueOnce(blobResult(PNG, "image/png", 8));

    const messages = await hydrateAgentMessageImages(ORG_ID, [{
      senderType: "customer",
      contentText: "attachment",
      attachmentRefs: [`blob:attachments/${ORG_ID}/image-id/photo.png`],
    }], { maxImages: 1, maxImageBytes: 8, maxTotalBytes: 8 });

    expect(messages[0]?.attachments?.[0]?.status).toBe("unavailable");
  });

  it("gives the newest message priority when the image-count limit is reached", async () => {
    getSpy.mockResolvedValueOnce(blobResult(JPEG, "image/jpeg"));

    const messages = await hydrateAgentMessageImages(ORG_ID, [
      {
        senderType: "customer",
        contentText: "older",
        attachmentRefs: [`blob:attachments/${ORG_ID}/older/photo.jpg`],
      },
      {
        senderType: "customer",
        contentText: "newer",
        attachmentRefs: [`blob:attachments/${ORG_ID}/newer/photo.jpg`],
      },
    ], { maxImages: 1, maxImageBytes: 16, maxTotalBytes: 16 });

    expect(messages[0]?.attachments?.[0]?.status).toBe("unavailable");
    expect(messages[1]?.attachments?.[0]?.status).toBe("available");
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy.mock.calls[0]?.[0]).toContain("/newer/");
  });

  it("enforces the total-byte limit before loading an older image", async () => {
    getSpy.mockResolvedValueOnce(blobResult(JPEG, "image/jpeg"));

    const messages = await hydrateAgentMessageImages(ORG_ID, [
      {
        senderType: "customer",
        contentText: "older",
        attachmentRefs: [`blob:attachments/${ORG_ID}/older/photo.jpg`],
      },
      {
        senderType: "customer",
        contentText: "newer",
        attachmentRefs: [`blob:attachments/${ORG_ID}/newer/photo.jpg`],
      },
    ], { maxImages: 2, maxImageBytes: 16, maxTotalBytes: JPEG.byteLength });

    expect(messages[0]?.attachments?.[0]?.status).toBe("unavailable");
    expect(messages[1]?.attachments?.[0]?.status).toBe("available");
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("never loads attachments from agent or note messages", async () => {
    const reference = `blob:attachments/${ORG_ID}/image-id/photo.png`;
    const messages = await hydrateAgentMessageImages(ORG_ID, [
      { senderType: "agent", contentText: "reply", attachmentRefs: [reference] },
      { senderType: "note", contentText: "note", attachmentRefs: [reference] },
    ]);

    expect(messages.every((message) => message.attachments === undefined)).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
