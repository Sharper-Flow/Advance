/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "The cleaned baseline still has six reviewed cycle families: types/index.ts > " +
        "types/change-state.ts; types/index.ts > types/epic-state.ts; " +
        "mcp-server/tools/index.ts > mcp-server/degradation.ts; " +
        "schema-registry.ts > storage/reconcile-plan.ts > ...; " +
        "archive/archive.ts > schema-registry.ts > ...; and " +
        "tool-registry.ts > tools/contract.ts. Keep this warning visible until " +
        "those cycles are removed.",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      severity: "error",
      comment:
        "Production source modules must be reachable. Tests, test setup, build " +
        "entries, and the projection boundary consumed by bin/lib are intentional " +
        "entry points and are excluded below.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/).*\\.(?:spec|test)\\.(?:js|cjs|mjs|jsx|ts|cts|mts|tsx)$",
          "(^|/)__mocks__(?:/|$)",
          "(^|/)__tests__/global-setup\\.ts$",
          "(^|/)reconcile-cli\\.ts$",
          "(^|/)cli/projection-boundary\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      severity: "error",
      comment:
        "AsyncLocalStorage intentionally uses node:async_hooks. It is excluded " +
        "from this standard deprecated-core rule; new deprecated core imports fail.",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^v8/tools/codemap$",
          "^v8/tools/consarray$",
          "^v8/tools/csvparser$",
          "^v8/tools/logreader$",
          "^v8/tools/profile_view$",
          "^v8/tools/profile$",
          "^v8/tools/SourceMap$",
          "^v8/tools/splaytree$",
          "^v8/tools/tickprocessor-driver$",
          "^v8/tools/tickprocessor$",
          "^node-inspect/lib/_inspect$",
          "^node-inspect/lib/internal/inspect_client$",
          "^node-inspect/lib/internal/inspect_repl$",
          "^async_hooks$",
          "^punycode$",
          "^domain$",
          "^constants$",
          "^sys$",
          "^_linklist$",
          "^_stream_wrap$",
        ],
        pathNot: ["^async_hooks$"],
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "save-change-allow-list.ts is a test-only inventory helper imported by " +
        "tests; it intentionally uses TypeScript's parser API. Other production " +
        "source may not depend on npm-dev packages.",
      from: {
        path: "^(src)",
        pathNot: [
          "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
          "^src/storage/save-change-allow-list[.]ts$",
        ],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    moduleSystems: ["cjs", "es6"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
