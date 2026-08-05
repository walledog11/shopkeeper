import { describe, expect, it } from "vitest";
import { HAIKU_MODEL, SONNET_MODEL } from "./ai/index.js";
import {
  resolveModelEffort,
  resolveModelTuning,
  resolvePlannerThinking,
} from "./model-tuning.js";

describe("resolveModelEffort", () => {
  it("defaults to medium rather than the API's high", () => {
    expect(resolveModelEffort(undefined)).toBe("medium");
    expect(resolveModelEffort("")).toBe("medium");
  });

  it("accepts every level the model supports", () => {
    for (const level of ["low", "medium", "high", "xhigh", "max"] as const) {
      expect(resolveModelEffort(level)).toBe(level);
    }
  });

  it("throws on an unrecognized level instead of silently falling back", () => {
    expect(() => resolveModelEffort("maximum")).toThrow(/AGENT_MODEL_EFFORT/);
  });
});

describe("resolvePlannerThinking", () => {
  it("defaults to disabled", () => {
    expect(resolvePlannerThinking(undefined)).toBe("disabled");
  });

  it("allows switching back to adaptive without a code change", () => {
    expect(resolvePlannerThinking("adaptive")).toBe("adaptive");
  });

  it("throws on anything else", () => {
    expect(() => resolvePlannerThinking("enabled")).toThrow(/AGENT_PLANNER_THINKING/);
  });
});

describe("resolveModelTuning", () => {
  it("sends Haiku neither parameter", () => {
    // Load-bearing: Haiku 4.5 rejects `effort` with a 400, and every plan routed
    // to the cheap tier runs on it. Sending either knob here breaks that path.
    expect(resolveModelTuning(HAIKU_MODEL, "capture")).toEqual({});
    expect(resolveModelTuning(HAIKU_MODEL, "execute")).toEqual({});
    expect(resolveModelTuning(HAIKU_MODEL, "read_only")).toEqual({});
  });

  it("sets effort and disables thinking when planning on Sonnet", () => {
    expect(resolveModelTuning(SONNET_MODEL, "capture")).toEqual({
      output_config: { effort: "medium" },
      thinking: { type: "disabled" },
    });
  });

  it("tunes effort but leaves thinking alone outside planning", () => {
    // Execution runs approved mutative work; read_only is composer Q&A. Neither
    // is a place to trade reasoning depth without an eval behind it.
    for (const mode of ["execute", "read_only"] as const) {
      expect(resolveModelTuning(SONNET_MODEL, mode)).toEqual({
        output_config: { effort: "medium" },
      });
    }
  });

  it("honours overrides so a caller can pin a level", () => {
    expect(resolveModelTuning(SONNET_MODEL, "capture", {
      effort: "low",
      plannerThinking: "adaptive",
    })).toEqual({
      output_config: { effort: "low" },
      thinking: { type: "adaptive" },
    });
  });

  it("omits both knobs for a model it has not been taught about", () => {
    // A future model bump gets no parameters until this table is updated —
    // which is the failure mode that produced this module in the first place.
    expect(resolveModelTuning("claude-opus-5", "capture")).toEqual({});
  });
});
