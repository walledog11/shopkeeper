// Uploads the rendered demo film to the shopkeeper-landing-assets Vercel Blob store.
// Usage: LANDING_BLOB_TOKEN=vercel_blob_rw_... node scripts/upload-demo-film.mjs [file]
import { put } from "@vercel/blob";
import { readFileSync } from "node:fs";

const token = process.env.LANDING_BLOB_TOKEN;
if (!token) {
  console.error("Set LANDING_BLOB_TOKEN to the shopkeeper-landing-assets read-write token.");
  process.exit(1);
}
const file = process.argv[2] ?? "/tmp/shopkeeper-demo-film.mp4";

const blob = await put("demo-film.mp4", readFileSync(file), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "video/mp4",
  cacheControlMaxAge: 31536000,
  token,
});
console.log(blob.url);
