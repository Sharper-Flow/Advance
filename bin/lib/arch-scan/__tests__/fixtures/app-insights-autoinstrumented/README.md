# app-insights-autoinstrumented (NEGATIVE fixture)

Negative fixture for the `env-var-injection-vs-sdk-import` arch-scan rule.

- `infra/web.bicep` injects `APPLICATIONINSIGHTS_CONNECTION_STRING` from Key
  Vault (same as the plumbed fixture) AND declares an Azure Monitor
  autoinstrumentation resource whose type literal matches the rule's
  acceptable-counterpart pattern
  `/applicationinsights\.autocollected|Microsoft\.AzureMonitor.*autoInstrumentation/i`.
- `package.json` is minimal — no SDK dependency.
- The autoinstrumentation resource represents codeless / publish-as-code
  monitoring: the agent attaches at runtime without an SDK import.

Expected scan outcome (Phase 1, `relationshipId: "env-var-injection-vs-sdk-import"`):

- 0 findings — the autoinstrumentation counterpart match suppresses the rule.
- `coverage.appliedRelationships` includes `env-var-injection-vs-sdk-import`.

Reference: https://learn.microsoft.com/azure/azure-monitor/app/codeless-overview

Note on realism: real-world App Service autoinstrumentation is most commonly
configured via `ApplicationInsightsAgent_EXTENSION_VERSION` / `XDT_MicrosoftApplicationInsights_Mode`
app settings on `Microsoft.Web/sites`. The registry's acceptable-counterpart
pattern is narrower — it looks for `Microsoft.AzureMonitor…autoInstrumentation`
or `applicationinsights.autocollected` literals in bicep. This fixture
matches the registry pattern (the contract under test) and includes the
literal `Microsoft.AzureMonitor/autoInstrumentation` resource type so the
counterpart fires deterministically. The registry pattern gap (real-world
App Service autoinstrumentation via appSettings does not satisfy it) is a
separate finding for the registry owner — see the engineer report.
