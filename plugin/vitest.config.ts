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
          // Vitest refuses to group projects whose effective worker counts
          // differ unless each declares its own order. `temporal` pins a single
          // worker via fileParallelism:false, so both projects must be explicit.
          sequence: { groupOrder: 0 },
          env: {
            ADV_TEST_PROJECT: "unit",
            ADV_TEST_FILE_PARALLELISM: "true",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "temporal",
          include: ["src/**/*.itest.ts"],
          fileParallelism: false,
          // Runs after the unit project; see the groupOrder note above.
          sequence: { groupOrder: 1 },
          // Files already run sequentially. Disabling module isolation lets the
          // module-level shared workflow-bundle cache in with-test-env.ts persist
          // across files, so the 188 KB workflow graph is webpack-bundled ONCE per
          // run instead of once per file (was the dominant cost of this project).
          isolate: false,
          env: {
            ADV_TEST_PROJECT: "temporal",
            ADV_TEST_FILE_PARALLELISM: "false",
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.itest.ts", "src/__tests__/**"],
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
