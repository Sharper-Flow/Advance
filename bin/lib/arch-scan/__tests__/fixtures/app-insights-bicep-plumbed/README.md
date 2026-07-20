# app-insights-bicep-plumbed (POSITIVE fixture)

Positive fixture for the `env-var-injection-vs-sdk-import` arch-scan rule.

- `infra/web.bicep` injects `APPLICATIONINSIGHTS_CONNECTION_STRING` from Key
  Vault (mimics the pokeedge-web pattern).
- `package.json` is minimal — no Azure Monitor OpenTelemetry package and no
  Application Insights runtime dependency.
- `src/index.ts` is minimal — no telemetry SDK import or init.
- No App Service autoinstrumentation resource is declared in bicep.
- No documentation asserts an out-of-process telemetry collector.

Expected scan outcome (Phase 1, `relationshipId: "env-var-injection-vs-sdk-import"`):

- 1 finding emitted on the env-var trigger hit.
- Finding shape: `severity: "major"`, `confidence: "high"`,
  `detection_method: "regex"`, `category: "capability-consistency"`.
- Trigger evidence `file: "infra/web.bicep"`, `line` points at the env-var
  reference; `matchedSignal: "APPLICATIONINSIGHTS_CONNECTION_STRING"`.
- `absence_proof.searchedRoots` is non-empty; `includedGlobs` spans the
  counterpart scope (`**/*.ts`, `**/*.js`, `**/*.bicep`, `**/*.md`);
  `excludedGlobs` includes `node_modules`; `parseFailures` is an array.

## Line map (1-indexed) of `infra/web.bicep`

| Line | Content (key only)                                                 |
|------|--------------------------------------------------------------------|
| 22   | `name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'`                    |
