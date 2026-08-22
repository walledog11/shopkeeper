import { ImageResponse } from "next/og";

export const alt = "Shopkeeper approvals and controls — set the boundary before the request arrives";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f2eb",
          color: "#2b2118",
          padding: "70px 76px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 2, textTransform: "uppercase" }}>
          Shopkeeper · approvals and controls
        </div>
        <div style={{ display: "flex", maxWidth: 1000, fontSize: 76, lineHeight: 1.02, fontWeight: 700 }}>
          Set the boundary before the request arrives.
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 24 }}>
          <span style={{ padding: "12px 20px", border: "2px solid #2b2118", borderRadius: 999 }}>Draft only</span>
          <span style={{ padding: "12px 20px", background: "#2b2118", color: "#f6f2eb", borderRadius: 999 }}>Ask first</span>
          <span style={{ padding: "12px 20px", border: "2px solid #2b2118", borderRadius: 999 }}>Trusted</span>
        </div>
      </div>
    ),
    size,
  );
}
