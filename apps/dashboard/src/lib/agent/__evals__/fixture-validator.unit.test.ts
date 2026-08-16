import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentPlan } from "@/types"
import { collectPlanExpectationFailures } from "./assertions"
import { normalizeMoneyCents, validateFixtures } from "./fixture-validator"
import type { Fixture } from "./types"

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "valid-fixture",
    description: "A valid fixture",
    suite: "core",
    setup: {
      channelType: "email",
      messages: [{ senderType: "customer", contentText: "Please refund all of order #1001." }],
    },
    instruction: "Handle the request.",
    expectedPlan: {
      mustCallTools: ["create_refund"],
      mustCallToolsWithInput: [{
        tool: "create_refund",
        inputEquals: { order_id: "1001" },
        moneyEquals: { amount: "20.00" },
      }],
    },
    ...overrides,
  }
}

describe("validateFixtures", () => {
  it("accepts every committed fixture", () => {
    const directory = join(__dirname, "fixtures")
    const files = readdirSync(directory).filter(file => file.endsWith(".json")).sort()
    const fixtures = files.map(file => JSON.parse(readFileSync(join(directory, file), "utf8")) as Fixture)
    expect(() => validateFixtures(fixtures, files)).not.toThrow()
  })

  it("rejects filename mismatches, contradictory tools, unknown tools, and shallow financial checks", () => {
    const invalid = fixture({
      id: "wrong-id",
      expectedPlan: {
        mustCallTools: ["create_refund", "not_a_tool"],
        mustNotCallTools: ["create_refund"],
        mustCallToolsWithInput: [{ tool: "create_refund", inputEquals: { order_id: "1001" } }],
      },
    })

    expect(() => validateFixtures([invalid], ["expected-id.json"])).toThrow(/does not match filename/)
    expect(() => validateFixtures([invalid], ["expected-id.json"])).toThrow(/both required and forbidden/)
    expect(() => validateFixtures([invalid], ["expected-id.json"])).toThrow(/unknown tool/)
    expect(() => validateFixtures([invalid], ["expected-id.json"])).toThrow(/moneyEquals\.amount/)
  })

  it("rejects missing required setup fields and invalid enums", () => {
    const invalid = fixture({
      setup: { channelType: "fax", messages: undefined } as never,
      expectedPlan: {
        mustCallTools: ["send_reply"],
        mustClassifyAs: "silent" as never,
        expectedAgentActions: [{ tool: "send_reply", status: "done", mode: "automatic" } as never],
      },
    })

    expect(() => validateFixtures([invalid])).toThrow(/setup\.channelType is invalid/)
    expect(() => validateFixtures([invalid])).toThrow(/setup\.messages is required/)
    expect(() => validateFixtures([invalid])).toThrow(/mustClassifyAs has invalid value/)
    expect(() => validateFixtures([invalid])).toThrow(/status is invalid/)
    expect(() => validateFixtures([invalid])).toThrow(/mode is invalid/)
  })

  it("validates classifier intents against the production vocabulary", () => {
    const invalid = fixture({
      setup: {
        channelType: "email",
        messages: [],
        classifierIntents: {
          mutative_request: "yes",
          invented_intent: true,
        } as never,
      },
    })

    expect(() => validateFixtures([invalid])).toThrow(/mutative_request must be boolean/)
    expect(() => validateFixtures([invalid])).toThrow(/unknown intent "invented_intent"/)
  })

  it("requires storefront fixtures to model their authorization boundary", () => {
    const missing = fixture({
      setup: { channelType: "shopify_chat", messages: [] },
    })
    const guestWithVerifiedOrder = fixture({
      setup: {
        channelType: "shopify_chat",
        authState: "guest",
        verifiedOrders: [{ orderId: "1", orderName: "#1" }],
        messages: [],
      },
    })

    expect(() => validateFixtures([missing])).toThrow(/must declare setup\.authState/)
    expect(() => validateFixtures([guestWithVerifiedOrder])).toThrow(/guest fixtures cannot carry/)
  })

  it("rejects effectively duplicate fixtures even when IDs and descriptions differ", () => {
    const first = fixture()
    const second = fixture({ id: "second", description: "Different prose" })
    expect(() => validateFixtures([first, second])).toThrow(/effectively identical/)
  })

  it("rejects negative financial fixtures without a useful outcome", () => {
    const invalid = fixture({
      id: "refund-negative",
      expectedPlan: { mustNotCallTools: ["create_refund", "create_gift_card"] },
    })
    expect(() => validateFixtures([invalid])).toThrow(/safe reply, clarification, or escalation/)
  })
})

describe("typed input matchers", () => {
  it("does not let exact string 20 match 120", () => {
    const exactFixture = fixture({
      expectedPlan: {
        mustCallToolsWithInput: [{ tool: "create_refund", inputEquals: { order_id: "20" } }],
      },
    })
    const plan: AgentPlan = {
      instruction: "test",
      steps: [],
      rawToolCalls: [{ id: "1", name: "create_refund", input: { order_id: "120" } }],
    }
    expect(collectPlanExpectationFailures(exactFixture, plan).failures).toHaveLength(1)
  })

  it("normalizes money-equivalent forms to integer cents", () => {
    expect(normalizeMoneyCents("20")).toBe(2000)
    expect(normalizeMoneyCents("20.00")).toBe(2000)

    const moneyFixture = fixture()
    const plan: AgentPlan = {
      instruction: "test",
      steps: [],
      rawToolCalls: [{ id: "1", name: "create_refund", input: { order_id: "1001", amount: "20" } }],
    }
    expect(collectPlanExpectationFailures(moneyFixture, plan).failures).toEqual([])
  })
})
