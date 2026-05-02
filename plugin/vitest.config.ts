import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.itest.ts", "scripts/**/*.test.ts"],
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
