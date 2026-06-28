import js from "@eslint/js";
import globals from "globals";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

const dashboardSourceFiles = ["apps/dashboard/src/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];

const repoNodeJsFiles = [
  "apps/dashboard/next.config.js",
  "apps/dashboard/postcss.config.mjs",
  "e2e/**/*.{js,mjs,cjs}",
  "eslint.config.mjs",
  "scripts/**/*.{js,mjs,cjs}",
];

const repoNodeTsFiles = [
  "apps/dashboard/vitest.config.ts",
  "apps/dashboard/vitest.integration.config.ts",
  "apps/dashboard/vitest.unit.config.ts",
  "apps/gateway/src/**/*.ts",
  "apps/gateway/vitest.config.ts",
  "apps/gateway/vitest.integration.config.ts",
  "apps/gateway/vitest.unit.config.ts",
  "e2e/**/*.{ts,mts,cts}",
  "packages/agent/src/**/*.ts",
  "packages/agent/vitest.config.ts",
  "packages/agent/vitest.integration.config.ts",
  "packages/agent/vitest.unit.config.ts",
  "packages/email/src/**/*.ts",
  "packages/email/vitest.config.ts",
  "packages/db/*.ts",
  "packages/db/scripts/*.ts",
  "playwright.browser.config.ts",
  "playwright.config.ts",
  "scripts/**/*.{ts,mts,cts}",
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
      "**/.next-dev/**",
      "**/.next-e2e/**",
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
