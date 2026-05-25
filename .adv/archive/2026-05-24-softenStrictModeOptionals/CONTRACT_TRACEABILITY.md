# Contract Traceability

**Change ID:** softenStrictModeOptionals
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-24T04:40:50.059Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.ts:53-209 FIELD_POLICIES full-sweep table; verified by tool-arg-preflight.test.ts AC12 parametrized matrix + GPT comprehensive payload tests |
| AC2 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.ts:30 zero?: PlaceholderPolicyAction; lines 277-285 applyFieldPolicies value===0 branch; tested by zero policy axis describe block in tool-arg-preflight.test.ts |
| AC3 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.ts:444-465 preflightToolArgs Zod loop refactored to read policyResult.normalizedArgs; tested by 'Zod validation reads normalizedArgs' describe block |
| AC4 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.ts:278-376 CROSS_FIELD_VALIDATORS.adv_change_create simplified; origin matrix + mutual-exclusion intact; tested by enforces adv_change_create test |
| AC5 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.ts:394-411 at-least-one-of guard; tested by 'full GPT update payload (all artifacts blank) triggers at-least-one-of' |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/change.ts:261-265 and 291-297 bypass-resilience comments on both defensive guards; verified by code review sub-agent 1 traceability |
| AC7 | acceptance_criterion | pass | test | git diff trunk -- plugin/src/storage/json.ts returns 0 lines; storage-layer blank artifact rejection (rq-toolArgBlankArtifactLinkage01.4) unchanged |
| AC8 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts grew ~599 lines; 30 cases in regression matrix; 4 GPT comprehensive payload tests; 27 audit-fields-still-reject parametrized cases; 4 zero policy axis tests; 3 Zod-normalizedArgs integration tests |
| AC9 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'full GPT create payload normalizes to minimal valid' test; normalizedArgs equals {summary, proposal, origin_kind} |
| AC10 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'full GPT update payload (all artifacts blank) triggers at-least-one-of' test |
| AC11 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'mixed GPT update payload normalizes blanks and accepts non-blank' test |
| AC12 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'audit-and-required fields still reject blank (AC12)' parametrized matrix with 27 cases covering content, command, approvalEvidence, confirmationEvidence, recoveryEvidence, reason, completedBy, user, branch, base, title, changeId |
| AC13 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'sentinel placeholders still reject even after blank-omit flip' test verifies parent_change_id with 'none', 'n/a', 'null', 'transcript' |
| AC14 | acceptance_criterion | pass | test | plugin/src/utils/tool-arg-preflight.test.ts 'no zero policy: value === 0 passes through' test; synthetic tool with no policy entry preserves zero value |
| AC15 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json:2287 rq-toolArgBlankArtifactLinkage01 body revised; scenarios .1/.3/.5 updated; .6 added |
| AC16 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json rq-toolPlaceholderPolicy01.5 scenario added |
| AC17 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json rq-toolArgBlankArtifactLinkage01.1 scenario revised to omit-on-blank semantics |
| AC18 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json rq-toolArgBlankArtifactLinkage01.3 scenario revised |
| AC19 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json rq-toolArgBlankArtifactLinkage01.5 scenario revised |
| AC20 | acceptance_criterion | pass | test | .adv/specs/advance-workflow/spec.json rq-toolArgBlankArtifactLinkage01.6 scenario added (audit fields still reject) |
| AC21 | acceptance_criterion | pass | test | adv_change_validate strict returned passed:true with only NO_DELTAS warning (non-blocking) |
| AC22 | acceptance_criterion | pass | test | AGENTS.md and ADV_INSTRUCTIONS.md each gained a strict-mode tolerance paragraph citing Vercel AI SDK #12200; line-guard bumped 950→960 in adv-skill-backed-commands-assets.test.ts |
| AC23 | acceptance_criterion | pass | test | pnpm run check passed; pnpm test 3102/3102 passed (233 test files, ~63s); zero flakes |
| C1 | constraint | respected | static_check | No provider detection or model-family branching introduced; policy table is provider-agnostic structural classification (P33) |
| C2 | constraint | respected | static_check | AC12 parametrized matrix (27 cases) confirms every required-when-present field still rejects blank |
| C3 | constraint | respected | static_check | git diff trunk -- plugin/src/storage/json.ts returns 0 lines |
| C4 | constraint | respected | static_check | No changes to OpenCode plugin SDK (@opencode-ai/plugin) or Vercel AI SDK; change is purely ADV-side |
| C5 | constraint | respected | static_check | INVALID_TOOL_ARGS error shape preserved: code, missing, invalid (field+message), canonical_minimal_payload, received_args all intact; verified by 'includes canonical minimal payload' test |
| C6 | constraint | respected | static_check | FIELD_POLICIES table is the single structural source of truth; no scattered Zod preprocess() calls or per-tool ad-hoc normalization added |
| DONT1 | avoidance | respected | review | No provider-specific code paths (if providerID === ...) introduced anywhere in preflight or tool registry |
| DONT2 | avoidance | respected | review | AC12 parametrized matrix confirms all named audit/identity/command fields still reject blank |
| DONT3 | avoidance | respected | review | No .optional() → .nullable() refactor; Zod schemas unchanged |
| DONT4 | avoidance | respected | review | No one-shot auto-retry mechanism added; failed preflight still returns structured error to caller |
| DONT5 | avoidance | respected | review | Storage-level blank artifact guard in json.ts unchanged (0 diff lines) |
| DONT6 | avoidance | respected | review | collectBlankCreateArtifactOrLinkageFields and validateCreateOriginLinkage in change.ts retained; only comments updated to mark bypass-resilience role |
| DONT7 | avoidance | respected | review | Spec law revised in lockstep (KD4 + KD9 in design.md); body + scenarios + version bump together; no oscillation expected |
| OOS1 | out_of_scope | not_applicable | not_applicable | Per-tool strict: false at AI SDK level not pursued; @opencode-ai/plugin@1.15.5 installed in node_modules does not expose Tool.strict |
| OOS2 | out_of_scope | not_applicable | not_applicable | No schema rewrite from .optional() to .nullable() performed |
| OOS3 | out_of_scope | not_applicable | not_applicable | hardenChangeCreation not reverted; only the optional-content reject policy flipped, catch-laziness-on-audit-fields intent preserved |
| OOS4 | out_of_scope | not_applicable | not_applicable | Storage-level blank artifact guard in json.ts unchanged |
| OOS5 | out_of_scope | not_applicable | not_applicable | No provider-detection or model-family branching introduced |
| OOS6 | out_of_scope | not_applicable | not_applicable | No changes to OpenCode plugin SDK passthrough behavior |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cbd763bdfbbd | AC2, AC3, AC14 | AC2, AC3, AC14 | C1, C5, C6, DONT1, DONT4 |  |
| tk-bcab8dce2942 | AC1, AC4, AC5, AC8, AC9, AC10, AC11, AC12, AC13 | AC1, AC4, AC5, AC8, AC9, AC10, AC11, AC12, AC13 | C1, C2, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT6, DONT7, OOS1, OOS2, OOS3, OOS5, OOS6 |  |
| tk-bb6c8bfd3609 | AC6 |  | C3, DONT5, DONT6 | Comment-only change. No logic modification; behavior is identical pre/post. Defense-in-depth layer continues working as before. |
| tk-6df4f2a0158f | AC15, AC16, AC17, AC18, AC19, AC20, AC21 | AC15, AC16, AC17, AC18, AC19, AC20, AC21 | C2 |  |
| tk-311b779f3d2e | AC22 |  | DONT1, DONT3 | Documentation-only change; no executable behavior to test. |
| tk-8cc160e52edb |  | AC7, AC23 | C5 | Verification gate task; no new behavior to TDD. Verifies via existing test infrastructure and inspection of unchanged file. |
