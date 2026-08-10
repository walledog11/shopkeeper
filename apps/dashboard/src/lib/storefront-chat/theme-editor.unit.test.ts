import { describe, expect, it } from "vitest";
import { buildShopifyThemeEditorAppEmbedUrl } from "./theme-editor";

describe("buildShopifyThemeEditorAppEmbedUrl", () => {
  it("builds a theme-editor deep link for the Shopkeeper Chat app embed", () => {
    const url = buildShopifyThemeEditorAppEmbedUrl(
      "palette-dev.myshopify.com",
      "d895bed09fae035e6177ee9d34eff219",
    );

    expect(url).toBe(
      "https://palette-dev.myshopify.com/admin/themes/current/editor"
      + "?context=apps&template=index&activateAppId=d895bed09fae035e6177ee9d34eff219%2Fchat",
    );
  });
});
