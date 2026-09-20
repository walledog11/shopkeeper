import { describe, expect, it } from "vitest"
import { verifyRealtimeToken } from "@shopkeeper/shared/realtime"
import { mintRealtimeToken } from "./token"

const SECRET = "test-internal-secret"

describe("mintRealtimeToken", () => {
  it("produces a token the shared verifier accepts", () => {
    const { token, expiresAt } = mintRealtimeToken("org_db_1", SECRET)
    expect(verifyRealtimeToken(token, SECRET)).toBe("org_db_1")
    expect(expiresAt).toBeGreaterThan(Date.now())
  })

  it("does not verify under a different secret", () => {
    const { token } = mintRealtimeToken("org_db_1", SECRET)
    expect(verifyRealtimeToken(token, "other-secret")).toBeNull()
  })

  it("honors a custom TTL", () => {
    const { expiresAt } = mintRealtimeToken("org_db_1", SECRET, 1000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
