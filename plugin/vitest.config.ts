import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.itest.ts"],
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
      // Mock bun:sqlite with better-sqlite3 for Node.js tests
      "bun:sqlite": new URL("./src/__mocks__/bun-sqlite.ts", import.meta.url)
        .pathname,
    },
  },
});
