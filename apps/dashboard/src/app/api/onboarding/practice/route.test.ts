import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ store: vi.fn(), articles: vi.fn(), article: vi.fn(), generate: vi.fn(), org: vi.fn() }));
vi.mock("@shopkeeper/db", async importOriginal => ({ ...await importOriginal<object>(), db: {
  integration: { findFirst: mocks.store }, kbArticle: { findMany: mocks.articles, findFirst: mocks.article },
} }));
vi.mock("@/lib/server/org", () => ({ getOrCreateOrg: mocks.org }));
vi.mock("@shopkeeper/agent/ai", () => ({ generateText: mocks.generate }));
vi.mock("@/lib/server/shopify-integration", () => ({ isShopifyIntegrationOperational: (store: { accessToken: string | null }) => Boolean(store.accessToken) }));
import { GET, POST } from "./route";

const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
function request(body: unknown) { return new Request("http://localhost/api/onboarding/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.org.mockResolvedValue({ id: "org-a", name: "Store", lifecycleStatus: "active", stripeStatus: null, settings: {} });
  mocks.store.mockResolvedValue({ accessToken: "test", tokenExpiresAt: null, metadata: null });
  mocks.article.mockResolvedValue({ id, title: "Returns", body: "Unused items can be returned within 30 days." });
  mocks.articles.mockResolvedValue([{ id, title: "Returns", body: "30 days" }, { id: "empty", title: "Empty", body: " " }]);
  mocks.generate.mockResolvedValue("You can return unused items within 30 days.");
});

describe("onboarding practice", () => {
  it("lists only nonempty sources from this workspace's Shopify knowledge", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sources: [{ id, title: "Returns" }], simulated: false });
    expect(mocks.articles).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a", knowledgeBase: { organizationId: "org-a", source: "shopify" } } }));
  });
  it("requires a connected store before spending on generation", async () => {
    mocks.store.mockResolvedValue(null);
    expect((await POST(request({ sourceId: id, question: "Can I return it?" }))).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not generate using an article outside this workspace", async () => {
    mocks.article.mockResolvedValue(null);
    expect((await POST(request({ sourceId: id, question: "Can I return it?" }))).status).toBe(404);
    expect(mocks.article).toHaveBeenCalledWith(expect.objectContaining({ where: { id, organizationId: "org-a", knowledgeBase: { organizationId: "org-a", source: "shopify" } } }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each([{ sourceId: "invalid", question: "Test" }, { sourceId: id, question: " " }, { sourceId: id, question: "x".repeat(501) }])("rejects invalid input before generation", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("returns the source with a text-only draft and applies the workspace spend settings", async () => {
    const response = await POST(request({ sourceId: id, question: "Can I return it?" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft: "You can return unused items within 30 days.", source: { id, title: "Returns", excerpt: "Unused items can be returned within 30 days." } });
    expect(mocks.generate).toHaveBeenCalledWith(expect.stringContaining("never invent"), [{ role: "user", content: JSON.stringify({ source: { title: "Returns", body: "Unused items can be returned within 30 days." }, question: "Can I return it?" }) }], expect.objectContaining({ orgId: "org-a", settings: expect.objectContaining({ autonomyTier: "guarded" }), maxTokens: 500 }));
  });
  it("treats an empty model result as a retryable failure", async () => {
    mocks.generate.mockResolvedValue(" ");
    expect((await POST(request({ sourceId: id, question: "Can I return it?" }))).status).toBe(503);
  });
});
