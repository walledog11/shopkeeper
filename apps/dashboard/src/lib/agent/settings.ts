// Re-export shim: agent settings moved to @clerk/agent (Track 2 extraction).
// Narrowed to the client-safe settings/types subpaths so the Anthropic SDK
// (pulled in by the full barrel) never leaks into the browser bundle.
export * from "@clerk/agent/settings";
export type * from "@clerk/agent/types";
