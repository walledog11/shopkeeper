import { useCallback, useState } from 'react'
import { errorMessageFromUnknown } from '@/lib/api/fetcher'

export interface StagedAttachment {
  // Local identity, so a chip can be shown and removed while the upload is
  // still in flight and has no server ref yet.
  localId: string
  name: string
  bytes: number
  ref: string | null
  error: string | null
}

let nextLocalId = 0

// Files upload as they are picked rather than on send, so the merchant learns a
// file is rejected while they are still writing, and the send itself carries
// refs instead of bytes.
export function useComposerAttachments() {
  const [attachments, setAttachments] = useState<StagedAttachment[]>([])

  const patch = useCallback((localId: string, next: Partial<StagedAttachment>) => {
    setAttachments(prev => prev.map(a => (a.localId === localId ? { ...a, ...next } : a)))
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    const staged = files.map(file => ({
      localId: `attachment-${nextLocalId++}`,
      name: file.name,
      bytes: file.size,
      ref: null,
      error: null,
    }))
    setAttachments(prev => [...prev, ...staged])

    await Promise.all(staged.map(async (entry, index) => {
      const body = new FormData()
      body.append('file', files[index])
      try {
        const res = await fetch('/api/attachments', { method: 'POST', body })
        const payload = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(payload?.error ?? 'Upload failed')
        }
        patch(entry.localId, { ref: payload.ref, name: payload.name, bytes: payload.bytes })
      } catch (err) {
        patch(entry.localId, { error: errorMessageFromUnknown(err, 'Upload failed') })
      }
    }))
  }, [patch])

  const removeAttachment = useCallback((localId: string) => {
    setAttachments(prev => prev.filter(a => a.localId !== localId))
  }, [])

  const clearAttachments = useCallback(() => setAttachments([]), [])

  // A file still uploading, or one that failed, must not silently drop out of a
  // send — the merchant attached it on purpose.
  const attachmentsBlockSend = attachments.some(a => a.ref === null)
  const attachmentRefs = attachments.flatMap(a => (a.ref ? [a.ref] : []))

  return {
    attachments,
    attachmentRefs,
    attachmentsBlockSend,
    addFiles,
    removeAttachment,
    clearAttachments,
  }
}

export type ComposerAttachments = ReturnType<typeof useComposerAttachments>
