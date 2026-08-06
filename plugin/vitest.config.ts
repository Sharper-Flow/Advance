import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          globalSetup: ["./src/__tests__/global-setup.ts"],
           env: {
            ADV_TEST_PROJECT: "unit",
            ADV_TEST_FILE_PARALLELISM: "true",
          },
        },
       },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**"],
    },
  },
  resolve: {
    alias: {
      // Mock the SDK to avoid ESM resolution issues in tests
      "@opencode-ai/plugin": new URL(
        "./src/__mocks__/opencode-plugin.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
