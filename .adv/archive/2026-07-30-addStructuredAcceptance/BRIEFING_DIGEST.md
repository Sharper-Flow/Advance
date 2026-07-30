# Archive Briefing Digest

**Change ID:** addStructuredAcceptance
**Title:** Add structured acceptance criteria
**Status:** archived
**Generated:** 2026-07-30T00:43:21.998Z

## Identity Anchors

- CHANGE
- STATUS
- TERMINAL_GATE_SUMMARY
- Origin: adhoc

## Archive Digest

**Status:** archived

| Gate | Status |
| --- | --- |
| proposal | done |
| discovery | done |
| design | done |
| planning | done |
| execution | done |
| acceptance | done |
| release | pending |

## Epic Context

No Epic membership

## Durable Facts

Showing 76 of 76 durable facts.

- **[archive_only_evidence]** decisions: Added an optional ContractItem.variant discriminated-union field (behavioral/evidence/spec_law/constraint) rather than a new contract-item union — Preserves backward compatibility and keeps canonical text as the single source of truth for legacy projections and review-matrix traceability
- **[archive_only_evidence]** decisions: Parsed structured variants once at the mint boundary after warrant stripping but before pushing the item — Ensures warrant extraction/validation is unaffected and malformed input fails before any contract mutation (AC5)
- **[archive_only_evidence]** decisions: Left the behavioral boundaries field optional and unpopulated by the current parser — Splitting on 'and' inside the outcome clause over-split existing criteria; boundary parsing belongs to the rendering task once a clearer grammar is defined
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/types/contract.test.ts src/validator/contract-mint.test.ts src/validator/warrant-boundary.test.ts src/validator/contract.test.ts (0) — GREEN: 59 tests passed (existing + new AC1/AC4/AC5 coverage)
- **[archive_only_evidence]** verification: ../bin/oc-test targeted -- src/validator/contract-mint.test.ts (with variant field/parser temporarily disabled) (1) — RED: 7 new AC1/AC4/AC5 tests failed before implementation was restored
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ncwmf_a3afe502
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: manual-red-demonstration
- **[archive_only_evidence]** decisions: Added regression tests rather than modifying source code — The schema, projection, and state propagation for criterion variants were already implemented in the prior task (tk-1421f6053d84); this task's scope was compatibility propagation tests for AC3/AC8/SC3
- **[archive_only_evidence]** decisions: Removed unused changeToDirectiveState import from change-state.test.ts — The import was already unused before this task; removing it resolved a lint error in the file I was editing (campsite cleanup)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/contract.test.ts src/temporal/change-state.test.ts src/schema-registry.test.ts src/validator/contract-mint.test.ts (1) — RED phase: targeted tests failed when acceptanceCriteriaFromContract legacy projection was deliberately broken (5 failures across projection tests)
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/types/contract.test.ts src/temporal/change-state.test.ts src/schema-registry.test.ts src/validator/contract-mint.test.ts (0) — GREEN phase: targeted tests passed; 130 tests across 4 files
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6nn65a_2018c39d
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6nnjw5_e8315c27
- **[archive_only_evidence]** decisions: Renderer passes variant through only when present; legacy items omit the field — Preserves flat-text rendering unchanged and avoids inventing synthetic text (AC6)
- **[archive_only_evidence]** decisions: Updated BriefingPacketRendererInput contract item type to optional ContractItemVariant — Keeps renderer pure/storage-free while enabling callers to surface mint-parsed variants
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/utils/briefing-packet-renderer.test.ts (0) — GREEN: 18 tests pass; AC2/AC6 targeted coverage green
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/tools/change.test.ts (0) — VERIFY: 152 tests pass; briefing input builder regression clean
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6p8e9r_0c1e6ef2
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6p65ah_2d08a3ae
- **[archive_only_evidence]** decisions: Inserted structured criterion authoring guidance as a new Phase 4.5.2 in adv-discover.md — Keeps the guidance adjacent to the acceptance-criteria checkpoint where criteria are actually written and approved
- **[archive_only_evidence]** decisions: Inserted structured criterion reading guidance in adv-review.md before the 12-dimension framework — Reviewers load the contract before assessing dimensions; the guidance frames how to read variant-bearing items without treating syntax as proof
- **[archive_only_evidence]** decisions: Added rq-disc16 to adv-discover and rq-structuredAcceptance01 to advance-workflow instead of reusing existing rq-acWarrant01 — Separates authoring guidance obligations from warrant-validation obligations while cross-referencing them; preserves single-responsibility spec requirements
- **[archive_only_evidence]** decisions: Used parse-safe notation exactly mirroring contract-mint.ts grammar — Ensures the authored guidance is internally consistent with the implemented parser and avoids mismatched examples that would fail minting
- **[archive_only_evidence]** decisions: Left docs/specs/*.md mirrors unchanged — Task scope explicitly limits spec deltas to .adv/specs/; updating markdown mirrors would expand scope beyond the contract
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/ac-warrant-guard-assets.test.ts src/workflow-noise-reduction-assets.test.ts src/adv-review-assets.test.ts src/adv-skill-backed-commands-assets.test.ts src/delegation-matrix.test.ts src/deploy-local.test.ts src/no-retired-tool-spec-refs.test.ts (0) — 190 asset and spec-citation tests pass; command and spec changes do not break existing assertions
- **[archive_only_evidence]** verification: bin/oc-test targeted -- src/schema-registry.test.ts src/types/contract.test.ts src/validator/contract-mint.test.ts src/validator/contract-variant-authority.test.ts src/utils/briefing-packet-renderer.test.ts (0) — 121 regression tests pass for structured variant schema, minting, authority invariants, and rendering
- **[archive_only_evidence]** verification: cd plugin && pnpm exec tsx scripts/check-frontmatter.ts && pnpm run schemas:check && pnpm run typecheck && pnpm run generate:manifests:check && pnpm run lint && pnpm run format:check (0) — Frontmatter, schemas, typecheck, manifests, lint, and format checks pass (3 pre-existing lint warnings unrelated to changes)
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_docs_structured_ac_2026-07-29
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_contract_variant_regression
- **[unresolved_action]** consumer_warnings: verification_missing: No durable adv_run_test evidence found for run_id: tr_check_frontmatter_and_schemas
- **[report_follow_up]** follow_ups: Design phase must specify the variant discriminator and which fields are required vs advisory per variant (discovery agenda item 1).
- **[report_follow_up]** follow_ups: Design must decide whether a variant may override the section-heading-derived evidencePolicy; if yes, gate-readiness (checkUnresolvedVerificationEvidence, isProofBearingEvidencePolicy) and the review-matrix evidencePolicy field become variant-aware and need coherence tests.
- **[report_follow_up]** follow_ups: Design must handle parseObligationLine single-line limitation for multi-line Given/When/Then blocks (edge case 1) — either a continuation-line grammar or require single-line GWT.
- **[report_follow_up]** follow_ups: Design must specify warrant-tag interaction with structured sub-fields (edge case 2) — parseWarrantTag currently strips only a trailing tag from the assembled text.
- **[report_follow_up]** follow_ups: Spec-law updates required for adv-discover (acceptance criteria checkpoint + advisory guard) and possibly advance-workflow (contract projection rq) per discovery agenda item 6.
- **[research_citation]** sources: Contract parser/mint: Line-by-line mint. parseObligationLine matches a SINGLE bullet line via ^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+?)\s*$; continuation/non-bullet lines return undefined and are skipped. Label via ^([A-Za-z]+\d+)\s*[:.)-]\s+. Evidence policy + verificationRequired derived from section heading mapping. parseWarrantTag strips [warrant:...] from the single line's text. items[] carry {id,kind,text,sourceArtifact,sourceHash,verificationRequired,evidencePolicy,status,warrants?,notRequiredReason?,requiredCritical?}. (plugin/src/validator/contract-mint.ts (buildContractFromAgreement, parseObligationLine:133-146, SECTION_MAPPINGS:39-88))
- **[research_citation]** sources: Warrant parser: WARRANT_TAG=/\[warrant:\s*([^\]]*)\]/i ([^\]] includes newlines). Strips tag, whitespace-normalizes text. ref grammar constrained to tool:<name>[#<arg>] | spec:<id>. Warrant resolution injected at mint by tools/contract.ts via buildWarrantLookup. This is the existing typed-annotation-on-text pattern. (plugin/src/validator/warrant.ts (parseWarrantTag:53,66-89; resolveWarrants:112-118))
- **[research_citation]** sources: Contract item schema (canonical): ContractItemSchema = {id, kind(5 enum), text, sourceArtifact, sourceHash?, verificationRequired(.default true), evidencePolicy, status(.default draft), notRequiredReason?, requiredCritical?, warrants?: string[]}. NO variant/discriminator field. ChangeContractSchema.version = z.literal(1). (plugin/src/types/changes.ts (ContractItemSchema:870-895, ChangeContractSchema:926-934))
- **[research_citation]** sources.omitted: 9 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: ADV carries acceptance-criterion content in THREE parallel representations today, all keyed off ContractItem.text: (1) the canonical typed ContractItem.text (warrant-stripped at mint), (2) the legacy state.acceptanceCriteria string[] projection (re-derived on every contractSet), and (3) the AcceptanceCriteriaSetSignal criteria string[]. Eight consumer surfaces read these: parser/mint, schemas, state projections, gate-readiness, briefing packets, review matrix, archive rendering, and the public generated schema. The coherence anchor is a single JSON.stringify drift check (CONTRACT_ACCEPTANCE_CRITERIA_DRIFT) that compares representation (2) against (1). Gate-readiness, review-matrix validation, required-obligation routing, and archive rendering are all ID/status/flag-based and NEVER read criterion text or variant — they are structurally variant-agnostic. The text-reading consumers (drift check, acceptanceCriteriaFromContract, briefing contract section, projectContractCoverage) are the coherence-critical set: any structured variant must keep .text as the single canonical serialization so these stay coherent. The existing warrant mechanism (parseWarrantTag -> typed warrants:string[] annotation parsed once at mint, text stays canonical, renderers optionally surface it) is the proven pattern to mirror.
- **[report_follow_up]** follow_ups: Planning parallelism: after the ContractItemSchema variant field lands, the schema/mint-parser/renderer/generated-schema-regen lanes are cycle-independent and can be planned as parallel tasks (untied to a specific AC).
- **[report_follow_up]** follow_ups: Reviewer-facing command guidance (adv-discover/review prose) is a distinct surface from the briefing renderer and still needs a guidance edit for AC2 — do not assume the renderer covers all reviewer views.
- **[report_follow_up]** follow_ups: Confirm the chosen variant enum (behavioral/evidence/spec-law/constraint) against the SectionContractMapping kinds (success_criterion/acceptance_criterion/constraint/avoidance/out_of_scope) to avoid a kind-vs-variant taxonomy collision.
- **[research_citation]** sources: Mint boundary (atomic parse-then-validate): buildContractFromAgreement ends with ChangeContractSchema.parse(); all CONTRACT_* errors (198,214,237) throw before any contract is returned/persisted — malformed input structurally cannot replace a valid contract. (plugin/src/validator/contract-mint.ts:242)
- **[research_citation]** sources: Bracketed-warrant extract+strip precedent: parseWarrantTag + WARRANT_TAG regex extract and strip [warrant: ...] before canonical text is persisted (contract-mint.ts:189-192); identical pattern available for a [variant: ...] tag, pure/cycle-free. (plugin/src/validator/warrant.ts:53-89)
- **[research_citation]** sources: ContractItem additive-optional schema pattern: Every additive field is .optional() (sourceHash, notRequiredReason, requiredCritical, warrants). warrants was added by addAcWarrantGuard via this exact pattern. Optional fields are schema-back-compatible by Zod default. (plugin/src/types/changes.ts:870-895)
- **[research_citation]** sources.omitted: 5 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: The design's additive optional-variant approach is structurally well-fit to the existing code, not a new subsystem. Five leverage candidates found; four shrink the task surface by reusing proven structure, one localizes rendering. No correctness blocker. Minor citation accuracy note: legacy acceptanceCriteria is derived in tools/contract.ts:187 (acceptanceCriteriaFromContract), not temporal/change-state.ts; change-state.ts:225 only passes it through.

SCOUT CANDIDATES (design mode, cap 5, sorted payoff/risk):

[1] ADOPT_NOW — Atomic mint already satisfies AC5; no new rollback design needed. buildContractFromAgreement validates via ChangeContractSchema.parse() as its final step and the tool layer persists only on success; all CONTRACT_* errors throw before return, so a malformed (Zod-invalid) variant cannot replace a stored contract. payoff:high risk:low tie:AC5,C3 evidence:contract-mint.ts:198,214,237,242 prior:new.

[2] ADOPT_NOW — Reuse the proven bracketed-tag extract+strip pattern (parseWarrantTag) for a [variant: behavioral|evidence|spec-law|constraint] annotation. The same extract-before-persist step that strips [warrant: ...] (contract-mint.ts:189-192) can parse+strip a variant tag, keeping exactly one structural interpretation path and preserving canonical text — directly realizing the design's anti-parallel-interpretation rejection rationale. payoff:high risk:low tie:AC1,AC4,C1,C3,DONT2 evidence:warrant.ts:53-89 + contract-mint.ts:187-192 prior:new.

[3] ADOPT_NOW — Additive variant field is a one-line .optional() change following established precedent (sourceHash/notRequiredReason/requiredCritical/warrants are all optional; warrants added identically by addAcWarrantGuard). AC8 schema-back-compat + public-schema regen are mechanical: one Zod line + pnpm run schemas:generate. payoff:high risk:low tie:AC8,AC3,C1 evidence:changes.ts:880,884,885,893 + AGENTS.md prior:new.

[4] DESIGN_AROUND — Coverage, review-matrix, and drift enforcement are structurally variant-blind (keyed on item.id / kind===acceptance_criterion / text). Variant therefore needs ZERO awareness in those code paths for AC7 to hold, but this must be encoded as an explicit design invariant with a regression test so a future variant-aware feature cannot silently regress it. payoff:medium risk:low tie:AC7,OOS2 evidence:contract.ts:101-109,186-225,227-241 prior:new.

[5] ADOPT_NOW — Agent-facing contract rendering localizes to one pure surface: buildContractSection maps items to {id,kind,text,status}. Extending this one mapping (and its input type) satisfies AC2/AC6 variant visibility without cross-cutting render fan-out. payoff:medium risk:low tie:AC2,AC6 evidence:briefing-packet-renderer.ts:41-59,323-338 prior:new.
- **[report_follow_up]** follow_ups: Pin canonical-text shape for multi-clause variants and the legacy-projection-stays-text-only invariant before planning.
- **[report_follow_up]** follow_ups: Name DDC2 import-boundary invariant (warrant-boundary.test.ts) in design Affected Components.
- **[report_follow_up]** follow_ups: When drafting the advance-workflow spec delta, add explicit scenarios for C2 (syntax != proof) and 'variant does not grant acceptance authority' to prevent future drift.
- **[research_citation]** sources: ContractItemSchema (text canonical, items array, no variant field today): ContractItemSchema has required text:z.string(); ChangeContractSchema.items is z.array(ContractItemSchema). Adding an optional variant field is additive; no current consumer reads a variant. (plugin/src/types/changes.ts:870-934)
- **[research_citation]** sources: Agreement-to-contract mint parser is line-based; warrant stripped+validated at mint: parseObligationLine regex is single-line; loop splits agreement by \r?\n. parseWarrantTag strips [warrant:...] and throws on malformed before items.push. Confirms Discovery Finding that the one-line parser cannot safely consume multi-line Given/When/Then blocks. (plugin/src/validator/contract-mint.ts:133-234)
- **[research_citation]** sources: Warrant extraction + DDC2 import boundary test: parseWarrantTag throws WarrantMalformedError on empty/invalid refs (no silent discard, satisfies C3). warrant-boundary.test enforces contract-mint.ts and warrant.ts MUST NOT statically import tool-registry/tools/* (DDC2). Design lists both files as affected but does not name DDC2. (plugin/src/validator/warrant.ts:53-109; plugin/src/validator/warrant-boundary.test.ts:1-21)
- **[research_citation]** sources.omitted: 8 additional sources omitted (bounded to first 3)
- **[archive_only_evidence]** architecture_assessment: Existing pattern: ChangeContract is a typed spine (rq-contractTrace01); contract.items carry id/kind/text/evidencePolicy/warrants. Legacy acceptanceCriteria is a pure item.text projection (change-state.ts:1250). Warrants are stripped+validated structurally at mint (rq-acWarrant01); malformed warrants throw, never silently drop (satisfies C3). The mint tool path is reject-before-replace: buildContractFromAgreement runs before any signal/state mutation and an outer catch returns an error leaving prior state intact (AC5). Public schemas are generated from Zod via z.toJSONSchema, so optional fields are additive by construction (AC8). Reference pattern for an additive optional annotation is exactly what the design proposes: extend ContractItemSchema with an optional variant field, keep text canonical, parse once at mint, render additive. Deviation from the boring/reference approach: NONE on the core decision. Two implementation-decision gaps remain unpinned (see validation.notes): (GAP-A) canonical-text shape for multi-clause behavioral variants - the line-based mint parser at contract-mint.ts:168,136 cannot ingest multi-line Given/When/Then today, so the design's parse-safe grammar must define whether canonical text is flattened-single-line or preserved-multi-line, AND must state the legacy acceptanceCriteria projection stays item.text-only for variant items; (GAP-B) the DDC2 import-boundary invariant (warrant-boundary.test.ts) on contract-mint.ts/warrant.ts is not named in the design though both files are listed as affected. Neither gap is a contract compromise - both have existing structural guardrails (tests + parser evidence). Spec-law consistency: rq-contractTrace01 (contract.items as source of truth; legacy acceptanceCriteria as projection of AC items) is preserved by the text-canonical decision - variant is presentation metadata, not a new obligation source. rq-acWarrant01 (structural mint-time warrant validation; CONTRACT_UNRESOLVED_WARRANT fails with no contract persisted) is preserved by the commitment to retain bracketed warrant extraction identically for flat and structured input. The agreement Draft Spec Deltas to advance-workflow and adv-discover add new requirements governing variant annotation/authoring and do not weaken existing contract-traceability or warrant law. Nuance to codify in the new spec law: variant syntax must not be treated as behavioral proof (C2) and must not grant acceptance authority (design: Variants affect presentation, not acceptance authority) - these should appear as explicit Given/When/Then scenarios in the added advance-workflow requirement. required_validation_consistency: partial - the design's Design-Derived Criteria align with AC1-AC8 and constraints, but GAP-A and GAP-B leave two invariants implicit that should be pinned before planning.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When a behavioral variant schema exposes optional boundary fields, mint parsing must populate them from an explicit parse-safe grammar; renderer-only fixtures can mask an incomplete mint-to-render path.
- **[archive_only_evidence]** changes_made: plugin/src/validator/contract-mint.ts: Parse comma-delimited behavioral `And` clauses into the optional `boundaries` field, retaining the canonical text unchanged; this completes AC2 rendering data.
- **[archive_only_evidence]** changes_made: plugin/src/validator/contract-mint.test.ts: Added a behavioral-variant regression proving an `And` boundary is separated while the canonical obligation remains unchanged.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/validator/contract-mint.test.ts, bin/oc-test targeted -- src/validator/contract-mint.test.ts src/utils/briefing-packet-renderer.test.ts src/validator/contract-variant-authority.test.ts src/types/contract.test.ts src/schema-registry.test.ts src/temporal/change-state.test.ts results=pass — RED evidence: the new boundary test failed because mint retained `, and ...` in outcome. GREEN: 21/21 contract-mint tests passed. Cross-cutting verification: 174/174 tests across 6 files passed. `git diff --check` passed for baseline and local changes.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/validator/contract-mint.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/validator/contract-mint.test.ts src/utils/briefing-packet-renderer.test.ts src/validator/contract-variant-authority.test.ts src/types/contract.test.ts src/schema-registry.test.ts src/temporal/change-state.test.ts
- **[unresolved_action]** required_main_agent_actions: Inspect and checkpoint the five scoped remediation files using normal ADV task completion flow; do not discard them.
- **[unresolved_action]** required_main_agent_actions: Rebase change/addStructuredAcceptance onto origin/trunk from the clean checkpointed worktree, resolve any conflicts, and rerun bin/oc-test smoke plus relevant targeted tests before release.
- **[unresolved_action]** required_main_agent_actions: Leave unrelated existing manifest-frontmatter.ts lint warnings alone for this change.
- **[wisdom_candidate]** wisdom_candidates: [gotcha] When adding structured optional variants, empty Zod strings can admit semantically malformed values. Enforce non-empty fields and cross-field proof-route requirements at the schema boundary, then regenerate public schemas.
- **[archive_only_evidence]** changes_made: plugin/src/types/changes.ts: Hardened every structured-variant field with non-empty validation and required evidence method-or-source validation, closing malformed structured-input acceptance gap.
- **[archive_only_evidence]** changes_made: plugin/src/types/contract.test.ts: Added AC5 regression proving a public contract item rejects evidence variants without a proof route.
- **[archive_only_evidence]** changes_made: plugin/src/validator/contract-mint.test.ts: Added AC5 mint-boundary regressions for empty evidence subject/method forms.
- **[archive_only_evidence]** changes_made: plugin/src/schema-registry.test.ts: Kept generated schema variant-kind assertion compatible with the discriminated-union public schema.
- **[archive_only_evidence]** changes_made: plugin/schemas/change.schema.json: Regenerated public change schema to require non-empty structured-variant fields.
- **[archive_only_evidence]** verification: tests_run=bin/oc-test targeted -- src/types/contract.test.ts src/validator/contract-mint.test.ts src/validator/contract-variant-authority.test.ts src/utils/briefing-packet-renderer.test.ts src/temporal/change-state.test.ts src/schema-registry.test.ts, pnpm --dir plugin run check, bin/oc-test smoke, git diff --check results=pass — Final targeted suite: 6 files, 176 tests passed. Final check passed: schema consistency, TypeScript, manifests, frontmatter, isolation, lockfile, ESLint, and formatting; only 3 pre-existing unused eslint-disable warnings in manifest-frontmatter.ts. Smoke previously passed 94 tests. git diff --check passed; JSON changed files parse successfully.
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/contract.test.ts src/validator/contract-mint.test.ts src/validator/contract-variant-authority.test.ts src/utils/briefing-packet-renderer.test.ts src/temporal/change-state.test.ts src/schema-registry.test.ts
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- **[unresolved_action]** consumer_warnings: verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check

## Contract / AC Coverage

| ID | Kind | Status |
| --- | --- | --- |
| SC1 | success_criterion | pass |
| SC2 | success_criterion | pass |
| SC3 | success_criterion | pass |
| SC4 | success_criterion | pass |
| AC1 | acceptance_criterion | pass |
| AC2 | acceptance_criterion | pass |
| AC3 | acceptance_criterion | pass |
| AC4 | acceptance_criterion | pass |
| AC5 | acceptance_criterion | pass |
| AC6 | acceptance_criterion | pass |
| AC7 | acceptance_criterion | pass |
| AC8 | acceptance_criterion | pass |
| C1 | constraint | respected |
| C2 | constraint | respected |
| C3 | constraint | respected |
| DONT1 | avoidance | respected |
| DONT2 | avoidance | respected |
| DONT3 | avoidance | respected |
| OOS1 | out_of_scope | not_applicable |
| OOS2 | out_of_scope | respected |

## Unresolved Actions

- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6ncwmf_a3afe502
- verification_missing: No durable adv_run_test evidence found for run_id: manual-red-demonstration
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6nn65a_2018c39d
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6nnjw5_e8315c27
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6p8e9r_0c1e6ef2
- verification_missing: No durable adv_run_test evidence found for run_id: tr_ms6p65ah_2d08a3ae
- verification_missing: No durable adv_run_test evidence found for run_id: tr_docs_structured_ac_2026-07-29
- verification_missing: No durable adv_run_test evidence found for run_id: tr_contract_variant_regression
- verification_missing: No durable adv_run_test evidence found for run_id: tr_check_frontmatter_and_schemas
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/validator/contract-mint.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/validator/contract-mint.test.ts src/utils/briefing-packet-renderer.test.ts src/validator/contract-variant-authority.test.ts src/types/contract.test.ts src/schema-registry.test.ts src/temporal/change-state.test.ts
- Inspect and checkpoint the five scoped remediation files using normal ADV task completion flow; do not discard them.
- Rebase change/addStructuredAcceptance onto origin/trunk from the clean checkpointed worktree, resolve any conflicts, and rerun bin/oc-test smoke plus relevant targeted tests before release.
- Leave unrelated existing manifest-frontmatter.ts lint warnings alone for this change.
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test targeted -- src/types/contract.test.ts src/validator/contract-mint.test.ts src/validator/contract-variant-authority.test.ts src/utils/briefing-packet-renderer.test.ts src/temporal/change-state.test.ts src/schema-registry.test.ts
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: pnpm --dir plugin run check
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: bin/oc-test smoke
- verification_missing: Reviewer aggregate evidence is non-authoritative; no typed adv_run_test run ID proves command: git diff --check
