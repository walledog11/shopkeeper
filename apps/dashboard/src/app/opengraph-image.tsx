import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Shopkeeper: customer support that texts you before it acts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site's display face, so the link preview reads like the page.
const newsreader = await readFile(join(process.cwd(), "assets/newsreader-display-400.woff"));

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 64,
          padding: "72px 80px",
          background: "#f5f4f2",
          color: "#1b1a19",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", width: 600 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -1 }}>shopkeeper</div>
          <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: 76, lineHeight: 1.04, letterSpacing: -2 }}>
            Customer support that texts you before it acts.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, width: 400, fontSize: 24, lineHeight: 1.35 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "18px 24px",
              borderRadius: 30,
              background: "#e9e9eb",
              color: "#0b0b0c",
            }}
          >
            Maya wants to swap her jumpsuit for a Small before it ships. I’d make the swap and reply on Instagram. OK to go ahead?
          </div>
          <div style={{ display: "flex", padding: "12px 24px", borderRadius: 30, background: "#0a84ff", color: "#fff" }}>yes</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Newsreader", data: newsreader, style: "normal", weight: 400 }],
    },
  );
}
