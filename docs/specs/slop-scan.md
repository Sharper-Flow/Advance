# Slop Scan

> **Version:** 1.4.0
> **Updated:** 2026-08-28

## Purpose

Capability: /adv-slop-scan command — detect AI-generated code quality issues including defensive overkill, deep nesting, and other slop patterns

## Requirements

### AST-First Detection Strategy

**ID:** `rq-ss001` | **Priority:** **[MUST]**

/adv-slop-scan must attempt AST-based analysis before regex or heuristic methods. One primary AST tool per language is used; required detector degradation is a hard failure, not a fallback finding source.

**Tags:** `detection`, `ast`, `phase1`

#### Scenarios

**TypeScript/JavaScript uses ESLint rules** (`rq-ss001.1`)

**Given:**
- A TypeScript or JavaScript project
- ESLint is available in the project

**When:** Phase 1 detection runs

**Then:**
- ESLint max-depth rule is used for nesting detection
- ESLint complexity rule is used for cyclomatic complexity
- Results are mapped to MAINT-004 smell ID

**Python uses radon** (`rq-ss001.2`)

**Given:**
- A Python project
- radon is available

**When:** Phase 1 detection runs

**Then:**
- radon cc is used for cyclomatic complexity
- Results above complexity_threshold are mapped to MAINT-004

**Go uses gocyclo** (`rq-ss001.3`)

**Given:**
- A Go project
- gocyclo is available

**When:** Phase 1 detection runs

**Then:**
- gocyclo is used for cyclomatic complexity
- Results above complexity_threshold are mapped to MAINT-004

**Fail fast when no required AST tool is available** (`rq-ss001.4`)

**Given:**
- No AST tool is installed for the detected language

**When:** Phase 1 detection runs

**Then:**
- No brace/indent fallback finding is generated
- The scan exits non-zero with failure code SLOP_SCAN_DEGRADED
- The unavailable required detector remains visible in coverage.detectors[] with its reason

---

### Configurable Detection Thresholds

**ID:** `rq-ss002` | **Priority:** **[MUST]**

Detection thresholds must have smart defaults and support per-project overrides via project.json features.slop_scan block. Defaults must not produce false positives for normal single-guard or single-catch patterns.

**Tags:** `config`, `thresholds`

#### Scenarios

**Default thresholds applied when no config present** (`rq-ss002.1`)

**Given:**
- project.json has no features.slop_scan block

**When:** /adv-slop-scan runs

**Then:**
- nesting_depth_threshold defaults to 4
- defensive_guard_threshold defaults to 3
- complexity_threshold defaults to 10
- ast_timeout_ms defaults to 10000

**Partial overrides respected** (`rq-ss002.2`)

**Given:**
- project.json has features.slop_scan.nesting_depth_threshold: 6

**When:** /adv-slop-scan runs

**Then:**
- nesting_depth_threshold is 6
- All other thresholds remain at defaults

**AST tool timeout enforced** (`rq-ss002.3`)

**Given:**
- An AST tool takes longer than ast_timeout_ms to complete on a file

**When:** Phase 1 detection runs on that file

**Then:**
- The tool invocation is terminated
- No brace/indent fallback finding is generated
- The scan exits non-zero with failure code SLOP_SCAN_DEGRADED
- The timed-out required detector remains visible in coverage.detectors[] with its reason

---

### Defensive Overkill Detection

**ID:** `rq-ss003` | **Priority:** **[MUST]**

/adv-slop-scan must detect overly defensive code patterns: redundant null/undefined guard chains, paranoid pre-condition checks on the same value, and unreachable fallback branches. These are reported as QUAL-011.

**Tags:** `detection`, `defensive`, `qual-011`

#### Scenarios

**Redundant guard chain detected** (`rq-ss003.1`)

**Given:**
- A function checks the same variable for null, undefined, and falsy in separate consecutive conditions

**When:** Phase 1 or Phase 2 detection runs

**Then:**
- A QUAL-011 finding is emitted
- Severity is at least medium
- confidence field reflects detection certainty

**Single guard clause is not flagged** (`rq-ss003.2`)

**Given:**
- A function has exactly one null check before using a value

**When:** /adv-slop-scan runs

**Then:**
- No QUAL-011 finding is emitted for that function

---

### Always-On Structured Output Fields

**ID:** `rq-ss004` | **Priority:** **[MUST]**

Every finding in JSON output must include nestingDepth, complexity, confidence, and detectionMethod fields regardless of verbosity flags. Text output must surface these fields inline.

**Tags:** `output`, `contract`, `json`

#### Scenarios

**JSON findings always include diagnostic fields** (`rq-ss004.1`)

**Given:**
- A finding is produced by any detection method

**When:** --json output is requested

**Then:**
- The finding object includes nestingDepth (number or null)
- The finding object includes complexity (number or null)
- The finding object includes confidence ('high' | 'medium' | 'low')
- The finding object includes detectionMethod ('ast' | 'regex' | 'heuristic' | 'degraded' | 'tool' | 'external')

**Text output surfaces diagnostic fields inline** (`rq-ss004.2`)

**Given:**
- A finding is produced

**When:** Text report is generated (no --json flag)

**Then:**
- The finding block includes detectionMethod and confidence
- nestingDepth and complexity are shown when non-null

---

### Dead Code Tool Preference

**ID:** `rq-ss005` | **Priority:** **[SHOULD]**

knip must be the primary dead code analyzer for TypeScript/JavaScript projects. ts-prune is treated as a legacy fallback only and must be documented as such.

**Tags:** `detection`, `dead-code`, `tooling`

#### Scenarios

**knip used as primary dead code tool** (`rq-ss005.1`)

**Given:**
- A TypeScript or JavaScript project
- knip is available

**When:** Dead code detection runs in Phase 1

**Then:**
- knip is invoked as the primary tool
- ts-prune is not invoked unless knip fails

**ts-prune used only as legacy fallback** (`rq-ss005.2`)

**Given:**
- knip is not available
- ts-prune is available

**When:** Dead code detection runs in Phase 1

**Then:**
- ts-prune is invoked as fallback
- Report annotates findings with [LEGACY TOOL: ts-prune]

---

### False-Positive Confidence and Actionability Control

**ID:** `rq-ss006` | **Priority:** **[MUST]**

/adv-slop-scan must classify findings by confidence and actionability so known clean samples stay below the accepted false-positive threshold for actionable findings while true high-confidence slop remains reported.

**Tags:** `false-positive`, `confidence`, `actionability`

#### Scenarios

**Known clean sample stays below actionable false-positive target** (`rq-ss006.1`)

**Given:**
- A named clean regression sample containing ordinary guard clauses, public API boundary validation, example snippets, and test fixtures
- The accepted false-positive target is 10 percent for actionable findings

**When:** /adv-slop-scan runs on the sample

**Then:**
- High-confidence and medium-confidence actionable false positives are less than or equal to 10 percent of actionable findings
- Single guard clauses and single I/O try/catch blocks do not produce QUAL-011 findings
- Clean code below the configured nesting threshold does not produce MAINT-004 findings

**Known dirty sample remains detected** (`rq-ss006.2`)

**Given:**
- A named dirty regression sample containing redundant guard chains and deep nesting at or above configured thresholds

**When:** /adv-slop-scan runs on the sample

**Then:**
- A QUAL-011 finding is emitted for redundant defensive checks
- A MAINT-004 finding is emitted for deep nesting
- The findings remain actionable when confidence is high or medium and source evidence is present

**Phase 1 confidence defaults are deterministic** (`rq-ss006.3`)

**Given:**
- Phase 1 emits findings from AST or regex detection

**When:** Findings are normalized before reporting

**Then:**
- AST-backed structural findings default to confidence: 'high'
- Regex-only defensive-overkill findings default to confidence: 'medium' unless corroborated by same-identifier redundant guard evidence
- Required detector degraded, failed, timed-out, unavailable, or applicable-required skipped coverage is reported as SLOP_SCAN_DEGRADED instead of as low-confidence fallback findings

---

### Low-Confidence Finding Grouping

**ID:** `rq-ss007` | **Priority:** **[MUST]**

/adv-slop-scan must preserve low-confidence findings for auditability while grouping them separately from actionable findings in human-readable output.

**Tags:** `output`, `confidence`, `json`

#### Scenarios

**Text output separates low-confidence findings** (`rq-ss007.1`)

**Given:**
- A finding has confidence: 'low'

**When:** Text output is generated

**Then:**
- The finding appears in a low-confidence or non-blocking section
- The finding is separated from actionable high-confidence and medium-confidence findings
- The report states that low-confidence findings are not blocking by default

**JSON output preserves low-confidence findings** (`rq-ss007.2`)

**Given:**
- A finding has confidence: 'low'

**When:** --json output is requested

**Then:**
- The finding remains present in findings[]
- The finding includes confidence, detectionMethod, nestingDepth, and complexity fields
- The finding includes grouping or actionability metadata that marks it non-blocking

---

### Context-Window Suppression

**ID:** `rq-ss008` | **Priority:** **[MUST]**

Phase 2 heuristic scanners must treat ADV context packets, examples, task summaries, and fixture descriptions as non-scannable context unless the issue is present in an actual target source file with source evidence.

**Tags:** `phase2`, `context`, `false-positive`

#### Scenarios

**Prompt context is not a finding location** (`rq-ss008.1`)

**Given:**
- A Phase 2 scanner prompt includes ADV change context, task summaries, examples, or known fixture snippets

**When:** The scanner evaluates findings

**Then:**
- The scanner does not emit findings against prompt context text
- Every finding cites a target source file and line or scoped source evidence
- Context packet text is used only for orientation

**Examples and fixtures are not treated as product defects by default** (`rq-ss008.2`)

**Given:**
- A scanned file is an example, fixture, or test sample intentionally demonstrating a smell

**When:** Phase 2 heuristic detection runs

**Then:**
- The scanner either suppresses the finding or marks it low-confidence/non-blocking unless the file is within the explicit target product scope
- The confidence rationale explains why the finding is or is not actionable

---

### Structural Correctness Bypass Detection

**ID:** `rq-ss009` | **Priority:** **[MUST]**

/adv-slop-scan must detect correctness-boundary overreach where heuristic inference, prose convention, fuzzy matching, or LLM/agent judgment is the sole authority for correctness, security, persistence, workflow state, gate completion, or spec compliance. Findings are reported as QUAL-012 and must distinguish advisory heuristics from heuristic-owned correctness boundaries.

**Tags:** `structural-correctness`, `heuristics`, `qual-012`, `p33`

#### Scenarios

**Heuristic-owned state mutation is actionable** (`rq-ss009.1`)

**Given:**
- Code uses fuzzy title/Jaccard/similarity matching or LLM judgment to suppress, create, mutate, or complete a persistent record
- No exact ref, schema validation, typed field, validator result, or explicit user confirmation controls the mutation

**When:** /adv-slop-scan runs

**Then:**
- A QUAL-012 finding is emitted
- confidence is high
- actionability is blocking when the affected scope is in the current change

**Advisory triage heuristic is not actionable** (`rq-ss009.2`)

**Given:**
- A heuristic only ranks, suggests, or labels a candidate for later confirmation
- Exact refs, typed fields, validators, or explicit user confirmation own the final decision

**When:** /adv-slop-scan runs

**Then:**
- No blocking QUAL-012 finding is emitted
- Any concern is omitted or grouped as low-confidence/non-blocking with a rationale

**Untrusted input reaches logic before recognition** (`rq-ss009.3`)

**Given:**
- Code processes untrusted input in business logic before parser/schema/allowlist recognition and normalization

**When:** /adv-slop-scan runs

**Then:**
- A QUAL-012 or security finding is emitted
- The fix recommends moving recognition/normalization to the boundary before processing

---

### Deletion Candidate Taxonomy

**ID:** `rq-ss010` | **Priority:** **[MUST]**

/adv-slop-scan must define deletion-candidate subtypes under MAINT-003 for unused dependency, unused export, unused file, unreachable branch, uncallable private symbol, and impossible feature-flag path. These are findings and review inputs only, not automatic deletion actions.

**Tags:** `dead-code`, `deletion-candidate`, `taxonomy`, `maint-003`

#### Scenarios

**Deletion candidates use MAINT-003 subtypes** (`rq-ss010.1`)

**Given:**
- /adv-slop-scan evaluates dead-code, bloat, or reachability signals

**When:** A candidate maps to unused dependency, unused export, unused file, unreachable branch, uncallable private symbol, or impossible feature-flag path

**Then:**
- The finding is labeled as a MAINT-003 deletion_candidate subtype
- The finding includes confidence, detectionMethod, source evidence, grouping, and actionability
- The report wording does not imply automatic deletion

**False-positive surfaces are protected** (`rq-ss010.2`)

**Given:**
- A candidate touches public exports, generated files, tests, fixtures, command modules, plugin registration surfaces, prompt context, examples, or task summaries

**When:** Deletion-candidate actionability is assigned

**Then:**
- The candidate is low-confidence or non-blocking unless target source evidence proves the deletion is safe
- The rationale names the protected surface or source evidence used

---

### Deletion Safety and Actionability Boundary

**ID:** `rq-ss011` | **Priority:** **[MUST]**

/adv-slop-scan must never treat heuristic-only, regex-only, text-only, or single-tool unused-code guesses as actionable removal proof. Uncertain deletion candidates must be grouped as low-confidence / user-review findings.

**Tags:** `dead-code`, `actionability`, `false-positive`, `p33`

#### Scenarios

**Heuristic-only deletion guesses are user-review only** (`rq-ss011.1`)

**Given:**
- A deletion candidate is supported only by text search, regex-only signals, heuristic inference, or agent judgment

**When:** Report grouping is assigned

**Then:**
- The candidate appears only in a low-confidence / user-review section
- actionability is non-blocking
- The report states that heuristic-only or text-only unused-code guesses are not actionable removal proof

**Structural evidence required before actionable removal proof** (`rq-ss011.2`)

**Given:**
- A deletion candidate has source evidence from tools, entrypoint/config checks, exact symbol/file/dependency references, or typed reachability roots

**When:** Actionability is assigned

**Then:**
- The candidate may be actionable only when structural evidence is present
- No single external tool is the sole correctness authority for deletion safety
- The finding recommends verification before removal rather than direct deletion

---

### Slop Scanner Coverage Report

**ID:** `rq-ss012` | **Priority:** **[MUST]**

/adv-slop-scan must summarize run, skipped, degraded, failed, timed-out, unavailable, and externally covered detectors in normal text output, expose detailed scanner coverage in JSON metadata, and fail hard when applicable required detector coverage is degraded.

**Tags:** `coverage`, `output`, `json`, `degraded`

#### Scenarios

**Text output summarizes coverage gaps** (`rq-ss012.1`)

**Given:**
- A detector is skipped, failed, timed out, unavailable, degraded, or externally covered for the detected language set

**When:** Text output is generated

**Then:**
- The report includes a scanner coverage summary
- Skipped, failed, timed-out, unavailable, degraded, and externally covered detectors are visible without verbose mode
- Missing detector coverage is surfaced as a coverage gap, not hidden
- Applicable required detector degraded, failed, timed-out, unavailable, or skipped coverage renders the scan unsuccessful

**JSON output includes coverage details** (`rq-ss012.2`)

**Given:**
- --json output is requested

**When:** Report output is generated

**Then:**
- The JSON object includes coverage.detectors[]
- Each detector includes a state of run, skipped, degraded, failed, timed_out, unavailable, or externally_covered
- The JSON object includes coverage.falsePositiveProtections
- When required coverage fails, the JSON object includes failure.code: SLOP_SCAN_DEGRADED and failure.failedDetectors[]

---

### Guarded Dead-Code Baseline Provenance Refresh

**ID:** `rq-ss013` | **Priority:** **[MUST]**

The slop-scan subsystem MUST expose one canonical dead-code baseline provenance refresh route that reconstructs the recorded prior Knip configuration, proves exact normalized-finding and MAINT-003 fingerprint equality against the current configuration at one source tree, and then changes only allowlisted provenance fields. The route MUST preserve reviewed fingerprint strings and order, remain separate from the read-only dead-code ratchet and fingerprint deletion authority, and leave the baseline unchanged when configuration reconstruction, detector evidence, set equality, input stability, or atomic replacement cannot be proved.

**Tags:** `dead-code`, `baseline`, `provenance`, `knip`, `fail-closed`

#### Scenarios

**Recorded prior configuration is reconstructed before comparison** (`rq-ss013.1`)

**Given:**
- A reviewed dead-code baseline records a canonical Knip configuration hash and entry roots
- The active Knip configuration has different entry roots

**When:** The canonical provenance refresh route evaluates the change

**Then:**
- The route reconstructs the prior configuration by replacing only the active entry roots with the recorded roots
- The reconstructed canonical hash MUST equal the recorded hash before detector execution
- Any other Knip configuration drift leaves the baseline unchanged

**Prior and current coverage use exact shared evidence** (`rq-ss013.2`)

**Given:**
- The recorded prior configuration was reconstructed successfully
- Prior and current configuration snapshots are anchored to one source tree and one Knip installation

**When:** Both Knip scans complete

**Then:**
- Both reports are accepted only when detector execution completed with success or findings
- Both reports use the canonical Knip normalizer
- The complete normalized finding sets and raw counts MUST match exactly
- The sorted MAINT-003 fingerprints produced by the reviewed identity MUST match exactly

**Successful refresh changes provenance only** (`rq-ss013.3`)

**Given:**
- Configuration reconstruction and both exact comparisons pass
- The baseline and active configuration remain unchanged during the proof

**When:** The refresh route builds the updated artifact

**Then:**
- Only the current configuration hash, current roots, source commit, coverage-review evidence, and canonical provenance-owner field may change
- Project patterns, fingerprint count, kind counts, review classification, deletion owner, and deletion authority remain unchanged
- All reviewed fingerprint strings remain byte-identical and in the same order

**Invalid or unequal evidence performs no baseline write** (`rq-ss013.4`)

**Given:**
- Configuration reconstruction fails, detector evidence degrades, normalized reports are invalid, compared sets differ, or inputs change during the proof

**When:** The refresh route reaches its decision boundary

**Then:**
- The route returns a typed refusal or blocked result
- The baseline target receives zero writes
- Temporary comparison files are removed

**Atomic replacement preserves the prior target on failure** (`rq-ss013.5`)

**Given:**
- All comparison and mutation-boundary checks pass
- The route attempts the allowlisted provenance replacement

**When:** A temporary write, synchronization, or rename fails

**Then:**
- The route returns a blocked result
- No partial baseline content is accepted
- Temporary output is removed when possible

**Refresh and deletion authorities stay separate** (`rq-ss013.6`)

**Given:**
- The repository exposes the read-only dead-code ratchet and the canonical provenance refresh route

**When:** Command wiring and baseline review authority are validated

**Then:**
- The dead-code ratchet exposes no baseline write option
- The provenance route is the only registered provenance writer
- The provenance route has no authority to add, remove, change, or reorder reviewed fingerprints
- Fingerprint deletion remains a separate review-owned action

---
