import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function readAsset(name: string): Promise<string> {
  // next dev starts in apps/dashboard; deployment adapters can start at the
  // repository root. Both locations contain the traced extension assets.
  try {
    return await readFile(resolve(process.cwd(), '../../extensions/shopkeeper-chat/assets', name), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return readFile(resolve(process.cwd(), 'extensions/shopkeeper-chat/assets', name), 'utf8');
  }
}

export async function chatPreviewDocument(nonce: string): Promise<string> {
  const [tokens, styles, widget] = await Promise.all([
    readAsset('shopkeeper-tokens.css'), readAsset('shopkeeper-chat.css'), readAsset('shopkeeper-chat.js'),
  ]);
  // No merchant-controlled strings are interpolated into executable HTML.
  // The parent sends settings as structured data after the widget is ready.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storefront chat preview</title>
<style>html,body{margin:0;height:100%;background:#f5f4f2}body{overflow:hidden}</style>
</head><body>
<template id="shopkeeper-preview-styles"><style>${tokens}\n${styles}</style></template>
<div id="shopkeeper-chat-root" data-preview="1" data-shop-name="Your store"><span hidden></span></div>
<script nonce="${nonce}">${widget.replace(/<\/script/gi, '<\\/script')}</script>
<script nonce="${nonce}">
window.addEventListener('message', function(event) {
  if (event.source !== window.parent || !event.data) return;
  if (event.data.type === 'shopkeeper:connect') {
    window.parent.postMessage({ type: 'shopkeeper:ready' }, '*');
    return;
  }
  if (event.data.type !== 'shopkeeper:preview') return;
  var root = document.getElementById('shopkeeper-chat-root');
  root.dataset.shopName = typeof event.data.shopName === 'string' ? event.data.shopName.slice(0, 60) : 'Your store';
  root.dispatchEvent(new CustomEvent('shopkeeper:preview', { detail: event.data }));
  window.parent.postMessage({ type: 'shopkeeper:rendered' }, '*');
});
window.parent.postMessage({ type: 'shopkeeper:ready' }, '*');
// Load typography after the preview is usable, even when the font service is slow.
var font = document.createElement('link');
font.rel = 'stylesheet';
font.href = 'https://api.fontshare.com/v2/css?f[]=general-sans@1,2&display=swap';
document.head.appendChild(font);
</script></body></html>`;
}
