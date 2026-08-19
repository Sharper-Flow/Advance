import { defineConfig } from "tsup";

export default defineConfig({
  // Object form flattens output: src/mcp-server/index.ts → dist/mcp-server.js
  // (array form preserves source path structure → dist/mcp-server/index.js,
  // which breaks the bundle-manifest + deploy paths expecting dist/mcp-server.js).
  entry: {
    index: "src/index.ts",
    "mcp-server": "src/mcp-server/index.ts",
    "reconcile-cli": "src/reconcile-cli.ts",
    "doctor-cli": "src/doctor-cli.ts",
    "summary-candidates-cli": "src/summary-candidates-cli.ts",
  },
  format: ["esm"],
  splitting: false,
  dts: true,
  clean: true,
  external: ["@opencode-ai/plugin"],
  // Bundle @modelcontextprotocol/sdk into dist/mcp-server.js so the deployed
  // artifact is self-contained (no node_modules needed at runtime path).
  // tsup externalizes all dependencies by default; this overrides for the SDK
  // which mcp-server.js imports via subpath exports.
  noExternal: ["@modelcontextprotocol/sdk"],
});
