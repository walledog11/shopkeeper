// Only normalized chat pictures are public. Message attachments sharing the
// workspace's storage prefix must never be reachable through this endpoint.
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const imagePath = new RegExp(`^/api/storefront-chat/images/(${uuid})/(${uuid})$`, 'i');

export const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;

export function chatImageUrl(organizationId: string, imageId: string): string {
  return `/api/storefront-chat/images/${organizationId}/${imageId}`;
}

export function parseChatImageUrl(value: string): { organizationId: string; imageId: string } | null {
  const match = imagePath.exec(value);
  return match ? { organizationId: match[1], imageId: match[2] } : null;
}

export function chatImagePathname(organizationId: string, imageId: string): string {
  // Workspace deletion already removes every upload under this prefix.
  return `attachments/${organizationId}/chat-images/${imageId}.webp`;
}
