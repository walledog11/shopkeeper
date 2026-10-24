"use client";

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessageFromUnknown, requestJson } from '@/lib/api/fetcher';
import { cn } from '@/lib/ui/cn';

async function preparePicture(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP picture.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a picture smaller than 10 MB.');
  // Resize before uploading so phone photos fit within the hosting request limit.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This picture could not be opened. Try another picture.');
  });
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare your picture. Please try again.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not prepare your picture.')),
      'image/webp', 0.9,
    ));
  } finally {
    bitmap.close();
  }
}

export function ChatPictureUpload({ url, disabled, onChange, onUploadingChange }: {
  url: string;
  disabled: boolean;
  onChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function upload(file: File) {
    if (disabled || uploading) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setUploading(true);
    onUploadingChange(true);
    try {
      const picture = await preparePicture(file);
      if (controller.signal.aborted) return;
      const body = new FormData();
      body.set('file', picture, picture.type === 'image/webp' ? 'chat-picture.webp' : 'chat-picture.png');
      const result = await requestJson<{ url: string }>('/api/integrations/shopify/storefront-chat/image', {
        method: 'POST', body, signal: controller.signal,
      }, 'Could not upload your picture. Please try again.');
      if (!controller.signal.aborted) onChange(result.url);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessageFromUnknown(cause, 'Could not upload your picture.'));
    } finally {
      if (!controller.signal.aborted) {
        setUploading(false);
        onUploadingChange(false);
      }
    }
  }

  return <div
    className={cn('rounded-lg transition-colors', dragging && 'bg-secondary outline-2 outline-ring outline-offset-4')}
    onDragOver={event => { event.preventDefault(); if (!disabled && !uploading) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={event => {
      event.preventDefault(); setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void upload(file);
    }}
  >
    <div className="mb-3 text-sm font-medium">Chat picture</div>
    <div className="flex items-center gap-4">
      <button type="button" disabled={disabled || uploading} onClick={() => input.current?.click()}
        aria-label={url ? 'Change chat picture' : 'Upload chat picture'}
        className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
        {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : url
          // The upload is already resized; external legacy images are supported too.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="Chat picture" className="size-full object-contain p-1.5" />
          : <MessageCircle className="size-6 stroke-[1.5] text-muted-foreground" />}
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || uploading} onClick={() => input.current?.click()}>
            {uploading ? 'Uploading…' : <><Upload className="size-3.5" />{url ? 'Change picture' : 'Upload picture'}</>}
          </Button>
          {url && <button type="button" disabled={disabled || uploading} onClick={() => { onChange(''); setError(null); }}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">Remove</button>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Your logo or a photo. We&apos;ll fit it for you.</p>
      </div>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose chat picture" className="sr-only"
      disabled={disabled || uploading} tabIndex={-1}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
