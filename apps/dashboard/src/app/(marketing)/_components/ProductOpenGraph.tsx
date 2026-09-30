import { ImageResponse } from "next/og";

export const productOpenGraphSize = { width: 1200, height: 630 };

export function createProductOpenGraph({
  eyebrow,
  title,
  tags,
  accent,
}: {
  eyebrow: string;
  title: string;
  tags: readonly string[];
  accent: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f5f4f2",
          color: "#1b1a19",
          padding: "70px 76px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, letterSpacing: 2, textTransform: "uppercase" }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, background: accent }} />
          Shopkeeper · {eyebrow}
        </div>
        <div style={{ display: "flex", maxWidth: 1040, fontSize: 76, lineHeight: 1.02, fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 22 }}>
          {tags.map((tag, index) => (
            <span
              key={tag}
              style={{
                padding: "11px 19px",
                border: `2px solid ${index === 0 ? accent : "#1b1a19"}`,
                background: index === 0 ? accent : "transparent",
                color: index === 0 ? "#f5f4f2" : "#1b1a19",
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    productOpenGraphSize,
  );
}
