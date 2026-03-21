# Slop Scan

> **Version:** 1.0.0
> **Updated:** 2026-02-26

## Purpose

Capability: /adv-slop-scan command — detect AI-generated code quality issues including defensive overkill, deep nesting, and other slop patterns

## Requirements

### AST-First Detection Strategy

**ID:** `rq-ss001` | **Priority:** **[MUST]**

/adv-slop-scan must attempt AST-based analysis before falling back to regex or heuristic methods. One primary AST tool per language is used; fallback is a brace/indent counter annotated as degraded.

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

**Fallback when no AST tool available** (`rq-ss001.4`)

**Given:**
- No AST tool is installed for the detected language

**When:** Phase 1 detection runs

**Then:**
- A brace/indent counter is used as fallback
- All findings from fallback have detectionMethod: 'degraded'
- Report includes [DEGRADED: AST tool unavailable] annotation

---

### Scanner Delegation Stays Single-Level

**ID:** `rq-ss006` | **Priority:** **[MUST]**

/adv-slop-scan may orchestrate first-level scanner sub-agents, but those scanner workers must perform their work inline and must NOT spawn additional nested sub-agents or delegates.

**Tags:** `orchestration`, `anti-recursion`, `phase2`

#### Scenarios

**Scanner workers do not recursively delegate** (`rq-ss006.1`)

**Given:**
- /adv-slop-scan runs Phase 2 heuristic detection

**When:** The command spawns `explore` scanner workers for slop categories

**Then:**
- Only the top-level /adv-slop-scan command performs delegation
- Each scanner worker performs analysis inline with its own tools
- No scanner worker spawns nested sub-agents or delegates

**Scanner workers do not invoke slash commands** (`rq-ss006.2`)

**Given:**
- A Phase 2 scanner worker needs more ADV context or coordination

**When:** The worker continues its scan

**Then:**
- The worker does not invoke `/adv-*` slash commands
- The worker either uses ADV tools directly or returns the gap to the orchestrator

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
- The file falls back to degraded detection
- Report annotates the file with [DEGRADED: AST timeout]

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
- The finding object includes detectionMethod ('ast' | 'regex' | 'heuristic' | 'degraded')

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
