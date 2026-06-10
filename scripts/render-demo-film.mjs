// Renders /demo-film frame by frame into JPEGs for mp4 assembly.
// Usage: node scripts/render-demo-film.mjs [--preview]
//   --preview  one frame per second (quick visual check)
// Env: FILM_URL (default http://localhost:3000/demo-film?capture), FPS (30), OUT_DIR
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";

const URL = process.env.FILM_URL ?? "http://localhost:3000/demo-film?capture";
const FPS = Number(process.env.FPS ?? 30);
const PREVIEW = process.argv.includes("--preview");
const OUT = process.env.OUT_DIR ?? (PREVIEW ? "/tmp/shopkeeper-film-preview" : "/tmp/shopkeeper-film-frames");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
// Hide the Next.js dev-tools badge so it doesn't burn into frames
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForFunction(() => typeof globalThis.__seek === "function");
const duration = await page.evaluate(() => globalThis.__filmDuration);

const step = PREVIEW ? 1 : 1 / FPS;
const total = Math.floor(duration / step);
let i = 0;
const started = Date.now();
for (let f = 0; f <= total; f++) {
  const t = Math.min(f * step, duration - 0.01);
  await page.evaluate((sec) => globalThis.__seek(sec), t);
  await page.screenshot({
    path: `${OUT}/f${String(i).padStart(5, "0")}.jpg`,
    type: "jpeg",
    quality: 90,
  });
  i++;
  if (i % 100 === 0) console.log(`${i}/${total + 1} frames (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
await browser.close();
console.log(`wrote ${i} frames to ${OUT} (duration ${duration}s @ ${PREVIEW ? "1fps preview" : FPS + "fps"})`);
