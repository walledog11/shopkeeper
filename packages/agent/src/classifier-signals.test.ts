import { describe, expect, it } from "vitest";
import {
  emptyIntents,
  parseClassifierSignals,
} from "./classifier-signals.js";

describe("parseClassifierSignals", () => {
  it("parses the persisted shape written by the gateway classifier", () => {
    const parsed = parseClassifierSignals({
      version: 3,
      language: "es",
      intents: {
        mutative_request: true,
        policy_question: false,
        order_status: true,
        fraud_signals: false,
        contradiction: false,
        out_of_scope_commercial: false,
        forwarded_injection: false,
        no_request: false,
      },
    });
    expect(parsed).toEqual({
      version: 3,
      language: "es",
      intents: {
        mutative_request: true,
        policy_question: false,
        order_status: true,
        fraud_signals: false,
        contradiction: false,
        out_of_scope_commercial: false,
        forwarded_injection: false,
        no_request: false,
      },
    });
  });

  // A version-2 row has no `no_request` key at all. It must read as false, i.e.
  // "they did ask for something" — the briefing hides no_request threads, so the
  // other default would empty it of every thread classified before the bump.
  it("reads a pre-no_request row as having a request", () => {
    const parsed = parseClassifierSignals({
      version: 2,
      language: "en",
      intents: { order_status: true },
    });
    expect(parsed?.intents.no_request).toBe(false);
    expect(parsed?.intents.order_status).toBe(true);
  });

  it("returns null when signals are absent or not an object", () => {
    expect(parseClassifierSignals(null)).toBeNull();
    expect(parseClassifierSignals(undefined)).toBeNull();
    expect(parseClassifierSignals("nope")).toBeNull();
  });

  it("defaults missing/malformed intents to all-false without throwing", () => {
    const parsed = parseClassifierSignals({ version: 2, language: "en" });
    expect(parsed?.intents).toEqual(emptyIntents());
    expect(parsed?.version).toBe(2);
  });

  it("coerces non-true intent values to false and normalizes language", () => {
    const parsed = parseClassifierSignals({
      version: "bad",
      language: "  FR  ",
      intents: { mutative_request: "yes", policy_question: 1, order_status: true },
    });
    expect(parsed?.version).toBeNull();
    expect(parsed?.language).toBe("fr");
    expect(parsed?.intents.mutative_request).toBe(false);
    expect(parsed?.intents.policy_question).toBe(false);
    expect(parsed?.intents.order_status).toBe(true);
  });
});
