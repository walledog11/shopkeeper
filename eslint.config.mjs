import js from "@eslint/js";
import globals from "globals";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const dashboardSourceFiles = ["apps/dashboard/src/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];

const repoNodeJsFiles = [
  "apps/dashboard/next.config.js",
  "apps/dashboard/postcss.config.mjs",
  "eslint.config.mjs",
  "scripts/**/*.{js,mjs,cjs}",
];

const repoNodeTsFiles = [
  "apps/dashboard/vitest.config.ts",
  "apps/dashboard/vitest.integration.config.ts",
  "apps/dashboard/vitest.unit.config.ts",
  "apps/gateway/src/**/*.ts",
  "apps/gateway/vitest.config.ts",
  "e2e/**/*.ts",
  "packages/db/index.ts",
  "packages/db/test-helpers.ts",
  "playwright.browser.config.ts",
  "playwright.config.ts",
];

function withFiles(config, files) {
  return {
    ...config,
    files,
  };
}

const dashboardConfigs = nextCoreWebVitals
  .filter((config) => !("ignores" in config))
  .map((config) => withFiles(config, dashboardSourceFiles));

const repoNodeGlobals = {
  ...globals.node,
};

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/next-env.d.ts",
    ],
  },
  ...dashboardConfigs,
  {
    files: dashboardSourceFiles,
    settings: {
      next: {
        rootDir: "apps/dashboard",
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  withFiles(js.configs.recommended, repoNodeJsFiles),
  {
    files: [...repoNodeJsFiles, ...repoNodeTsFiles],
    languageOptions: {
      globals: repoNodeGlobals,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: repoNodeTsFiles,
    languageOptions: {
      ...config.languageOptions,
      globals: {
        ...repoNodeGlobals,
        ...config.languageOptions?.globals,
      },
    },
  })),
];
