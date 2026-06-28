import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { mintRealtimeToken } from "./token"

const SECRET = "test-internal-secret"

// Mirrors apps/gateway/src/realtime/token.ts so a format drift on either side
// fails its own test.
function verify(token: string, secret: string): { orgId: string; exp: number } | null {
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const encoded = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = createHmac("sha256", secret).update(encoded).digest("hex")
  if (signature !== expected) return null
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  return { orgId: payload.orgId, exp: payload.exp }
}

describe("mintRealtimeToken", () => {
  it("produces a token the gateway algorithm verifies", () => {
    const { token, expiresAt } = mintRealtimeToken("org_db_1", SECRET)
    const decoded = verify(token, SECRET)
    expect(decoded?.orgId).toBe("org_db_1")
    expect(decoded?.exp).toBe(expiresAt)
    expect(expiresAt).toBeGreaterThan(Date.now())
  })

  it("does not verify under a different secret", () => {
    const { token } = mintRealtimeToken("org_db_1", SECRET)
    expect(verify(token, "other-secret")).toBeNull()
  })

  it("honors a custom TTL", () => {
    const { expiresAt } = mintRealtimeToken("org_db_1", SECRET, 1000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
