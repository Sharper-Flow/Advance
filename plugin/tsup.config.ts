import { defineConfig } from "tsup";

export default defineConfig({
  // Object form flattens output: src/mcp-server/index.ts → dist/mcp-server.js
  // (array form preserves source path structure → dist/mcp-server/index.js,
  // which breaks the bundle-manifest + deploy paths expecting dist/mcp-server.js).
  entry: {
    index: "src/index.ts",
    "mcp-server": "src/mcp-server/index.ts",
  },
  format: ["esm"],
  splitting: false,
  dts: true,
  clean: true,
  external: ["@opencode-ai/plugin"],
});
