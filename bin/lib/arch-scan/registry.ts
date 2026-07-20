/**
 * adv CLI — arch-scan capability-consistency relationship registry
 *
 * Validator revision #1: TypeScript registry (not YAML). Each entry is a
 * typed {@link CapabilityRelationship} validated via `as const satisfies`.
 *
 * The registry is the single source of truth for which capability-
 * consistency relationships the typed arch-scan pipeline knows how to
 * evaluate. The markdown layer (advisory/heuristic findings) and the
 * typed layer (deterministic findings) both read from this registry; the
 * `detection_phase` field routes entries to Phase 1 (deterministic, runs
 * on every scan) or Phase 3 (heuristic, requires intent corroboration).
 *
 * Regex safety (P33 + project conventions): every pattern below is a
 * bounded alternation or a simple anchored literal. No nested quantifiers,
 * no unbounded `(.+)+` shapes — see `registry.test.ts` for the ReDoS
 * heuristic screen that enforces this at test time.
 */

/**
 * A capability-consistency relationship. Defines:
 *   - a `trigger` (the signal that a capability claim was made)
 *   - one or more `acceptable_counterparts` (signals that the claim was
 *     honored at runtime)
 *   - optional `exception_signals` (signals that suppress OR escalate the
 *     finding, selected per-entry via `exception_semantics`)
 *   - optional entry-level `intent_required` (declarations that soften the
 *     finding from "blocker" to "documented intent")
 *   - optional `exception_semantics` ("suppress" | "escalate", default
 *     "suppress") — selects how the evaluator treats a matched
 *     exception_signal
 *
 * `detection_phase` routes the entry to the deterministic (1) or heuristic
 * (3) pipeline phase.
 */
export interface CapabilityRelationship {
  readonly id: string;
  readonly title: string;
  readonly detection_phase: 1 | 3;
  readonly trigger: {
    readonly file_globs: readonly string[];
    readonly pattern: RegExp;
    readonly description: string;
  };
   readonly acceptable_counterparts: ReadonlyArray<{
     readonly description: string;
     readonly file_globs: readonly string[];
     readonly pattern: RegExp;
     /**
      * Optional trigger discriminator. When present, this counterpart can
      * satisfy only a trigger hit matching this pattern. This keeps a
      * multi-mapping relationship (for example config tool → owner package)
      * from treating an unrelated counterpart as sufficient.
      */
     readonly trigger_pattern?: RegExp;
    /**
     * Optional per-counterpart intent declarations. When omitted, the
     * counterpart satisfies the relationship on its own.
     */
    readonly intent_required?: readonly string[];
  }>;
  readonly exception_signals: ReadonlyArray<{
    readonly description: string;
    readonly file_globs: readonly string[];
    readonly pattern: RegExp;
  }>;
  /**
   * Entry-level intent declarations. When populated, the evaluator softens
   * the finding severity if any of these declarations are present in the
   * repo. Honors DONT9 (manifest) and DONT10 (scaffold).
   */
  readonly intent_required?: readonly string[];
  readonly severity_hint: "blocker" | "major" | "minor" | "nit";
  readonly confidence: "high" | "medium" | "low";
  /**
   * How the evaluator interprets a matched exception_signal.
   *
   *   - `"suppress"` (default when omitted): the rule does NOT fire when
   *     any exception_signal matches. Backward-compatible behavior.
   *   - `"escalate"`: the rule FIRES even when an exception_signal
   *     matches; severity is boosted by one level (nit → minor → major →
   *     blocker, capped at blocker) and the matched signal is attached as
   *     `exception` evidence. Escalate-mode rules additionally use the
   *     `scanDebtMarkers` helper to detect nearby TODO/FIXME/HACK/XXX
   *     comments within a 20-line window of each trigger hit; any such
   *     marker counts as an exception signal and produces evidence.
   *
   * Leaving the field unset is identical to `"suppress"`, so existing
   * registry entries do not need to declare it.
   */
  readonly exception_semantics?: "suppress" | "escalate";
}

/**
 * The five capability-consistency relationships shipped in v1.
 *
 * Order is significant: the markdown layer (command.md + SKILL.md) lists
 * these in the same order, and the asset test enforces 4-file sync.
 */
export const CAPABILITY_RELATIONSHIPS: readonly CapabilityRelationship[] = [
  {
    id: "env-var-injection-vs-sdk-import",
    title: "Env var injected via IaC without SDK import",
    detection_phase: 1,
    trigger: {
      file_globs: [
        "**/*.bicep",
        "**/*.tf",
        "**/*.tfvars",
        "**/docker-compose*.yml",
        "**/docker-compose*.yaml",
      ],
      // Bounded simple alternation of two literal env var names.
      pattern: /APPLICATIONINSIGHTS_CONNECTION_STRING|APPINSIGHTS_INSTRUMENTATIONKEY/g,
      description:
        "Azure Application Insights connection string or instrumentation key is injected via IaC/compose without a matching SDK import.",
    },
    acceptable_counterparts: [
      {
        description: "Application Insights SDK initialized in source.",
        file_globs: ["**/*.ts", "**/*.js"],
        pattern: /@azure\/monitor-opentelemetry|applicationinsights/s,
      },
      {
        description: "App Service autoinstrumentation configured in bicep.",
        file_globs: ["**/*.bicep"],
        pattern: /applicationinsights\.autocollected|Microsoft\.AzureMonitor.*autoInstrumentation/i,
      },
      {
        description: "Documented external agent or sidecar instrumentation.",
        file_globs: ["**/*.bicep", "**/*.md"],
        pattern: /external\s+agent|sidecar.*instrumentation/i,
      },
    ],
    exception_signals: [],
    severity_hint: "major",
    confidence: "high",
  },
  {
    id: "config-vs-dependency-presence",
    title: "Config block present without owning dependency",
    detection_phase: 1,
    trigger: {
      file_globs: ["**/package.json"],
      // Bounded alternation inside a captured group; literal `"\s*:` anchor.
      pattern: /"(knip|eslintConfig|prettier|stylelint|commitlint)"\s*:/g,
      description:
        "package.json declares a tool config block (knip/eslintConfig/prettier/stylelint/commitlint) without the owning runtime/dev dependency.",
    },
    acceptable_counterparts: [
      {
        description: "knip declared as a dependency.",
        file_globs: ["**/package.json"],
        pattern: /"knip"\s*:\s*"/,
        trigger_pattern: /"knip"\s*:/,
      },
      {
        description: "eslint declared as a dependency (owner of eslintConfig).",
        file_globs: ["**/package.json"],
        pattern: /"eslint"\s*:\s*"/,
        trigger_pattern: /"eslintConfig"\s*:/,
      },
      {
        description: "prettier declared as a dependency.",
        file_globs: ["**/package.json"],
        pattern: /"prettier"\s*:\s*"/,
        trigger_pattern: /"prettier"\s*:/,
      },
      {
        description: "stylelint declared as a dependency.",
        file_globs: ["**/package.json"],
        pattern: /"stylelint"\s*:\s*"/,
        trigger_pattern: /"stylelint"\s*:/,
      },
      {
        description: "@commitlint/cli declared as a dependency (owner of commitlint config).",
        file_globs: ["**/package.json"],
        pattern: /@commitlint\/cli"\s*:\s*"/,
        trigger_pattern: /"commitlint"\s*:/,
      },
    ],
    exception_signals: [
      {
        description:
          "Workspace hoist configuration indicates the dependency is provided by the workspace root.",
        file_globs: ["**/pnpm-workspace.yaml", "**/lerna.json"],
        pattern: /(hoist|workspace)/i,
      },
    ],
    severity_hint: "major",
    confidence: "high",
  },
  {
    id: "report-only-header-with-deferred-todo",
    title: "Report-Only security header with deferred enforcement",
    detection_phase: 1,
    trigger: {
      file_globs: ["**/*.ts", "**/*.js", "**/*.py", "**/*.go"],
      // Three literal header names joined by simple alternation.
      pattern:
        /Content-Security-Policy-Report-Only|X-Frame-Options-Report-Only|X-Content-Type-Options-Report-Only/g,
      description:
        "Report-Only security header is set without an enforced equivalent or active migration plan.",
    },
    acceptable_counterparts: [
      {
        description: "Enforced equivalent header set in the same code surface.",
        file_globs: ["**/*.ts", "**/*.js"],
        // Negative lookahead `(?!\s*-\s*Report)` is a single bounded assertion,
        // not a nested quantifier — safe.
        pattern: /Content-Security-Policy(?!\s*-\s*Report)/,
      },
      {
        description: "Reporting endpoint configured for the Report-Only header.",
        file_globs: ["**/*.ts", "**/*.js"],
        pattern: /report-to\s*[:=]|report-uri\s*[:=]/,
      },
    ],
    // These exception_signals ESCALATE severity rather than suppress it.
    // The evaluator interprets the presence of these signals as
    // "deferred enforcement with expired deadline" — semantically the
    // inverse of a suppressive exception. Schema records the signals;
    // semantics live in the evaluator via `exception_semantics: "escalate"`.
    exception_signals: [
      {
        description: "Nearby TODO/FIXME referencing enforcement.",
        file_globs: ["**/*.ts", "**/*.js"],
        pattern: /\b(TODO|FIXME|HACK|XXX)\b.*enforc/i,
      },
      {
        description: "Expired enforcement deadline annotation.",
        file_globs: ["**/*.ts", "**/*.js"],
        pattern: /\b(20\d{2}-\d{2}-\d{2}|@20\d{2}-\d{2}-\d{2})\b/,
      },
    ],
    // Rev #9: MDN documents Report-Only as a legitimate testing mode, so a
    // deterministic regex match does not imply a deterministic conclusion.
    severity_hint: "major",
    confidence: "medium",
    // Rule 3 contract: when an exception_signal OR a nearby debt marker
    // (TODO/FIXME/HACK/XXX within 20 lines, detected via scanDebtMarkers)
    // is present, the rule FIRES and severity is boosted by one level
    // (major → blocker). Default semantics ("suppress") would silence the
    // rule — the opposite of what deferred-enforcement detection requires.
    exception_semantics: "escalate",
  },
  {
    id: "manifest-reference-vs-runtime-registration",
    title: "Web app manifest referenced without service worker",
    detection_phase: 3,
    trigger: {
      file_globs: ["**/*.html", "**/*.tsx", "**/*.svelte"],
      pattern: /rel\s*=\s*["']manifest["']/i,
      description:
        "HTML/TSX/Svelte references a web app manifest but no service worker registration is detected.",
    },
    acceptable_counterparts: [
      {
        description: "Service worker registered at runtime, or Workbox instantiated.",
        file_globs: ["**/*.ts", "**/*.js"],
        pattern: /navigator\.serviceWorker\.register|new\s+Workbox/,
      },
    ],
    exception_signals: [],
    intent_required: [
      "workbox dependency in package.json",
      "declared PWA policy in README/AGENTS.md",
      "Chrome installability criteria met (display:standalone + start_url + icons ≥192px and ≥512px)",
    ],
    severity_hint: "minor",
    confidence: "low",
  },
  {
    id: "scaffold-vs-test-green-path",
    title: "Scaffold present without test runner configuration",
    detection_phase: 3,
    trigger: {
      file_globs: ["**/android/**", "**/ios/**", "**/detox/**", "**/cypress/**"],
      pattern: /(build\.gradle|capacitor\.settings\.gradle|cypress\.config)/,
      description:
        "Native/E2E scaffold directory present without a matching test runner configuration.",
    },
    acceptable_counterparts: [
      {
        description: "Test runner configuration (maestro/detox/appium/cypress).",
        file_globs: ["**/*.ts", "**/*.js", "**/*.json", "**/*.yaml"],
        pattern: /(maestro|detox|appium|cypress).*config/i,
      },
    ],
    exception_signals: [],
    intent_required: [
      "script entry in package.json referencing the scaffold",
      "CI job invoking the scaffold",
      "explicit declared field in package.json or config",
    ],
    severity_hint: "minor",
    confidence: "low",
  },
] as const satisfies readonly CapabilityRelationship[];

/**
 * Look up a relationship by id. Returns `undefined` when not registered.
 */
export function findCapabilityRelationship(
  id: string,
): CapabilityRelationship | undefined {
  return CAPABILITY_RELATIONSHIPS.find((entry) => entry.id === id);
}

/**
 * Return the subset of relationships that run in the given detection phase.
 * Used by the orchestrator to select which relationships to evaluate during
 * Phase 1 (deterministic) vs Phase 3 (heuristic).
 */
export function relationshipsByPhase(
  phase: 1 | 3,
): readonly CapabilityRelationship[] {
  return CAPABILITY_RELATIONSHIPS.filter((entry) => entry.detection_phase === phase);
}
