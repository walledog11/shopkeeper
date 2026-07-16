import { get } from "@vercel/blob";
import type {
  AgentImageMediaType,
  AgentRecentMessage,
} from "./agent-context.js";
import logger from "./logger.js";

const PRIVATE_BLOB_REF_PREFIX = "blob:";
const IMAGE_EXTENSION_RE = /\.(?:gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const IMAGE_LOAD_TIMEOUT_MS = 5_000;

export const AGENT_IMAGE_LIMITS = {
  maxImages: 3,
  maxImageBytes: 5 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
} as const;

const AGENT_IMAGE_MEDIA_TYPES = new Set<AgentImageMediaType>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export interface RecentMessageAttachmentRefs {
  senderType: string;
  contentText: string | null;
  attachmentRefs: readonly string[];
}

interface AgentImageLimits {
  maxImages: number;
  maxImageBytes: number;
  maxTotalBytes: number;
}

interface LoadedAgentImage {
  data: Buffer;
  mediaType: AgentImageMediaType;
}

type AgentImageRejectionReason =
  | "blob_error"
  | "blob_missing"
  | "blob_status"
  | "byte_limit"
  | "count_limit"
  | "invalid_reference"
  | "invalid_stream"
  | "mime_mismatch"
  | "unsupported_mime";

type AgentImageLoadResult =
  | { ok: true; image: LoadedAgentImage }
  | { ok: false; reason: AgentImageRejectionReason };

function looksLikeImageReference(reference: string): boolean {
  return IMAGE_EXTENSION_RE.test(reference);
}

function parseWorkspacePrivateImagePath(
  reference: string,
  organizationId: string,
): string | null {
  if (!reference.startsWith(PRIVATE_BLOB_REF_PREFIX)) return null;

  const pathname = reference.slice(PRIVATE_BLOB_REF_PREFIX.length);
  const prefix = `attachments/${organizationId}/`;
  if (!pathname.startsWith(prefix) || !looksLikeImageReference(pathname)) return null;

  const relativeSegments = pathname.slice(prefix.length).split("/");
  if (
    relativeSegments.length !== 2
    || relativeSegments.some((segment) => !/^[\w.-]+$/.test(segment) || segment === "." || segment === "..")
  ) {
    return null;
  }

  return pathname;
}

function normalizeImageMediaType(value: string | null): AgentImageMediaType | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized && AGENT_IMAGE_MEDIA_TYPES.has(normalized as AgentImageMediaType)
    ? normalized as AgentImageMediaType
    : null;
}

function sniffImageMediaType(data: Buffer): AgentImageMediaType | null {
  if (
    data.length >= 3
    && data[0] === 0xff
    && data[1] === 0xd8
    && data[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    data.length >= 8
    && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length >= 6
    && (data.subarray(0, 6).toString("ascii") === "GIF87a"
      || data.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12
    && data.subarray(0, 4).toString("ascii") === "RIFF"
    && data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function readStreamWithinLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }

  return byteLength > 0 ? Buffer.concat(chunks, byteLength) : null;
}

async function loadPrivateAgentImage(
  pathname: string,
  maxBytes: number,
): Promise<AgentImageLoadResult> {
  if (maxBytes <= 0) return { ok: false, reason: "byte_limit" };

  try {
    const result = await get(pathname, {
      access: "private",
      abortSignal: AbortSignal.timeout(IMAGE_LOAD_TIMEOUT_MS),
    });
    if (!result) return { ok: false, reason: "blob_missing" };
    if (result.statusCode !== 200 || !result.stream) {
      return { ok: false, reason: "blob_status" };
    }

    const mediaType = normalizeImageMediaType(result.blob.contentType);
    if (!mediaType) return { ok: false, reason: "unsupported_mime" };
    if (result.blob.size <= 0 || result.blob.size > maxBytes) {
      return { ok: false, reason: "byte_limit" };
    }

    const data = await readStreamWithinLimit(result.stream, maxBytes);
    if (!data) return { ok: false, reason: "invalid_stream" };
    if (sniffImageMediaType(data) !== mediaType) {
      return { ok: false, reason: "mime_mismatch" };
    }

    return { ok: true, image: { data, mediaType } };
  } catch {
    return { ok: false, reason: "blob_error" };
  }
}

/**
 * Hydrates only customer-supplied, workspace-owned private image blobs. Newest
 * messages win when a turn exceeds its deterministic image or byte budget.
 */
export async function hydrateAgentMessageImages(
  organizationId: string,
  messages: readonly RecentMessageAttachmentRefs[],
  limits: AgentImageLimits = AGENT_IMAGE_LIMITS,
): Promise<AgentRecentMessage[]> {
  const hydrated: AgentRecentMessage[] = messages.map((message) => ({
    senderType: message.senderType,
    contentText: message.contentText,
  }));
  let loadedImageCount = 0;
  let loadedByteCount = 0;
  let unavailableImageCount = 0;
  const rejectionReasons: Partial<Record<AgentImageRejectionReason, number>> = {};
  const rejectImage = (reference: string, reason: AgentImageRejectionReason) => {
    unavailableImageCount += 1;
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
    return { type: "image", reference, status: "unavailable" } as const;
  };

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.senderType !== "customer") continue;

    const attachments: NonNullable<AgentRecentMessage["attachments"]> = [];
    for (const reference of message.attachmentRefs) {
      if (!looksLikeImageReference(reference)) continue;

      const pathname = parseWorkspacePrivateImagePath(reference, organizationId);
      const remainingBytes = limits.maxTotalBytes - loadedByteCount;
      if (!pathname) {
        attachments.push(rejectImage(reference, "invalid_reference"));
        continue;
      }
      if (loadedImageCount >= limits.maxImages) {
        attachments.push(rejectImage(reference, "count_limit"));
        continue;
      }
      if (remainingBytes <= 0) {
        attachments.push(rejectImage(reference, "byte_limit"));
        continue;
      }

      const loadResult = await loadPrivateAgentImage(
        pathname,
        Math.min(limits.maxImageBytes, remainingBytes),
      );
      if (!loadResult.ok) {
        attachments.push(rejectImage(reference, loadResult.reason));
        continue;
      }

      const { image } = loadResult;
      loadedImageCount += 1;
      loadedByteCount += image.data.byteLength;
      attachments.push({
        type: "image",
        reference,
        status: "available",
        mediaType: image.mediaType,
        data: image.data.toString("base64"),
      });
    }

    if (attachments.length > 0) {
      hydrated[messageIndex] = { ...hydrated[messageIndex], attachments };
    }
  }

  if (unavailableImageCount > 0) {
    logger.warn({
      organizationId,
      loadedImageCount,
      loadedByteCount,
      unavailableImageCount,
      rejectionReasons,
    }, "[agent:image] Customer images were unavailable to the model");
  } else if (loadedImageCount > 0) {
    logger.info({
      organizationId,
      loadedImageCount,
      loadedByteCount,
    }, "[agent:image] Customer images loaded for the model");
  }

  return hydrated;
}
