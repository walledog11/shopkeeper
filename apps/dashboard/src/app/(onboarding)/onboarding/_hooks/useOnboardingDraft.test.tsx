// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOnboardingDraft } from "./useOnboardingDraft";
import { STORAGE_KEY } from "../_lib/onboarding-model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let hook: ReturnType<typeof useOnboardingDraft>;
function Harness({ org = "org-a", pinned = null }: { org?: string; pinned?: number | null }) {
  const value = useOnboardingDraft({ userId: "user-a", organizationId: org, clerkLoaded: true, founderName: null, organizationName: null, pinnedStepIndex: pinned, savedEmail: undefined });
  useEffect(() => { hook = value; });
  return <span>{value.idx}:{value.data.shopDomain}</span>;
}
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/onboarding?step=email"); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("onboarding navigation and persistence", () => {
  it("updates the resume URL when advancing and restores that step after remount", async () => {
    await act(async () => root.render(<Harness pinned={1} />));
    await act(async () => hook.advance());
    expect(window.location.search).toBe("?step=connect");
    expect(hook.idx).toBe(2);
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(<Harness pinned={2} />));
    expect(hook.idx).toBe(2);
  });
  it("responds to browser back/forward navigation", async () => {
    await act(async () => root.render(<Harness pinned={1} />));
    await act(async () => hook.go(3));
    await act(async () => { window.history.replaceState(null, "", "/onboarding?step=email"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(hook.idx).toBe(1);
  });
  it("does not copy a draft into another workspace", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => hook.update({ shopDomain: "first.myshopify.com" }));
    await act(async () => root.render(<Harness org="org-b" />));
    expect(hook.data.shopDomain).toBe("");
    expect(JSON.parse(localStorage.getItem(`${STORAGE_KEY}:user-a:org-a`)!).shopDomain).toBe("first.myshopify.com");
  });
  it("carries a new user's store address into the workspace just created", async () => {
    function NewWorkspace({ org }: { org?: string }) { const value = useOnboardingDraft({ userId: "user-a", organizationId: org, clerkLoaded: true, founderName: null, organizationName: null, pinnedStepIndex: null, savedEmail: undefined }); useEffect(() => { hook = value; }); return null; }
    await act(async () => root.render(<NewWorkspace />));
    await act(async () => hook.update({ shopDomain: "new.myshopify.com" }));
    await act(async () => root.render(<NewWorkspace org="created" />));
    expect(hook.data.shopDomain).toBe("new.myshopify.com");
  });
});
