---
name: adv-slop-scan
description: Scan for AI slop patterns including defensive and nested code
agent: general
---

# ADV Slop Scan

> **SUB-AGENT CONTEXT**: Return findings directly. Status markers are for main sessions only—omit them to maximize your output buffer.

You are orchestrating a **codebase scan for AI-generated code quality issues ("slop")** using patterns defined in `slop-smells.yaml`.

This command uses a **two-phase detection strategy**:
1. **Phase 1**: AST-first automatable detection + regex signal layer for deterministic patterns
2. **Phase 2**: AI-assisted heuristic detection via parallel sub-agents

## Argument Parsing

Parse `$ARGUMENTS` for options:

| Flag | Description | Default |
|------|-------------|---------|
| `--phase 1` | Run Phase 1 only (fast, automatable) | Both phases |
| `--phase 2` | Run Phase 2 only (heuristic) | Both phases |
| `--json` | Output in JSON format | Text format |
| `--verbose` | Show detailed scan progress | Off |
| `--timeout N` | Sub-agent timeout in seconds | 120 |
| `--include-untracked` | Include untracked git files | Off |
| `<path>` | Limit scan to specific directory | `.` (all) |

**Flag parsing logic:**
1. Extract `--phase N` → set `PHASE_MODE` to `1`, `2`, or `both`
2. Extract `--json` → set `OUTPUT_FORMAT` to `json`
3. Extract `--verbose` → set `VERBOSE` to `true`
4. Extract `--timeout N` → set `TIMEOUT` to N (default: 120)
5. Extract `--include-untracked` → set `INCLUDE_UNTRACKED` to `true`
6. Remaining non-flag argument → set `SCAN_PATH`

---

## Pre-flight Checks

### Step 1: Check Git Repository

```bash
git rev-parse --is-inside-work-tree 2>/dev/null || echo "NOT_GIT_REPO"
```

**If not a git repository:**
```
Not a git repository. Slop scan requires git to determine file scope.

Options:
- Initialize git: `git init && git add .`
- Or run from a git-tracked directory
```
Stop execution.

### Step 2: Load slop-smells.yaml

```bash
cat slop-smells.yaml 2>/dev/null || echo "YAML_NOT_FOUND"
```

**If file not found:**
```
slop-smells.yaml not found. This file defines the patterns to scan for.

To get started:
- Copy slop-smells.yaml from the ADV plugin
- Or create your own pattern definitions
```
Stop execution.

**If YAML is malformed** (parse error):
```
slop-smells.yaml contains invalid YAML syntax.

Error: <parse error details>

Validate your YAML at: https://www.yamllint.com/
```
Stop execution.

### Step 3: Enumerate Files to Scan

```bash
# Get git-tracked files
git ls-files <SCAN_PATH>

# If --include-untracked, also get untracked (respecting .gitignore)
git ls-files --others --exclude-standard <SCAN_PATH>
```

**Filter to source code files** (exclude non-code):
- Include: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.rb`, `.php`, `.swift`, `.kt`, `.cs`, `.c`, `.cpp`, `.h`
- Exclude: `*.min.js`, `*.min.css`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `*.d.ts`
- Exclude: Binary files, images, compiled output

**If no files to scan:**
```
No files to scan. Check your .gitignore or add files to git.

Files found: 0
Path filter: <SCAN_PATH or ".">
```
Stop execution.

### Step 4: Display Scan Scope

```
============================================================
              SLOP SCAN STARTING
============================================================

SCOPE: <N> files in <SCAN_PATH>
PHASE: <1 | 2 | Both>
OPTIONS: <flags enabled>

============================================================
```

### Worktree Context Propagation

Sub-agents inherit the default project root, NOT the current working directory. When running from a worktree, sub-agents will look for files in the wrong location unless explicitly told where to look.

**Step 1: Detect current working directory**

```bash
pwd
```

Record the result as `{workdir}`.

**Step 2: Include in every sub-agent prompt**

Every sub-agent spawned in Phase 2 MUST include:

```
WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.
```

**Why this matters:** When running from a git worktree (e.g., `~/.local/share/opencode/worktree/.../change/featureX`), the worktree has different file contents than the main repo. Sub-agents that don't know the working directory will read stale files from the wrong branch, report false positives, or fail to find files that only exist on the worktree branch.

**Step 3: Use `{workdir}` for Phase 1 commands**

All Phase 1 `rg`, `eslint`, `vulture`, and other CLI commands MUST be run with `workdir` set to `{workdir}` so they operate on the correct file tree.

---

## Phase 1: Automatable Detection

**Goal**: Fast AST-first detection of structural slop, plus regex signal checks for obvious patterns.

Run AST tools where available, then grep/ripgrep for pattern categories. Map findings to smell IDs from `slop-smells.yaml`.

### Load Threshold Configuration (`project.json`)

Before scanning, load `features.slop_scan` from `project.json` and apply defaults when omitted:

```json
{
  "nesting_depth_threshold": 4,
  "defensive_guard_threshold": 3,
  "complexity_threshold": 10,
  "ast_timeout_ms": 10000
}
```

Use these values consistently for AST tools, regex signal escalation, and report metadata.

### AST-First Structural Detection (MAINT-004, QUAL-011)

Run one primary structural tool per language. If unavailable or timed out, fall back to brace/indent counting and annotate as degraded.

| Language | Primary Tool | Check | Command | Maps To |
|----------|--------------|-------|---------|---------|
| TypeScript/JavaScript | ESLint | `npx eslint --version` | `npx eslint --rule '{max-depth:[error,{max:N}],complexity:[error,N]}' <path>` | `MAINT-004` |
| Python | radon | `radon --help` | `radon cc -n C <path>` | `MAINT-004` |
| Go | gocyclo | `gocyclo -over 1 .` | `gocyclo -over N <path>` | `MAINT-004` |

**Fallback behavior (deterministic):**
- Use brace/indent nesting counter for files where AST tool unavailable/timed out
- Set `detectionMethod: degraded`
- Add annotation: `[DEGRADED: AST tool unavailable]` or `[DEGRADED: AST timeout]`

### Defensive Overkill Signal Layer (QUAL-011)

Regex signals for repeated guard checks on the same identifier (signal only; semantic confirmation happens in Phase 2):

```bash
# repeated null/undefined checks on same symbol in close proximity
rg -n "if\s*\([^)]*(===\s*null|===\s*undefined|==\s*null|!=\s*null|!==\s*undefined)[^)]*\)" --type ts --type js --type py

# paranoid optional chaining and fallback chains
rg -n "\?\.[^\n]*\?\.[^\n]*\?\." --type ts --type js
rg -n "\|\|\s*null\s*\|\|\s*undefined" --type ts --type js
```

Escalate to `QUAL-011` when repeated guard signals on the same value are >= `defensive_guard_threshold`.

### Pattern Detection

Execute these searches (adjust regex for language context):

#### Debug Artifacts (AI-008, QUAL-*)
```bash
# console.log/print statements (not in logging files)
rg -n "console\.(log|debug|info|warn|error)" --type ts --type js
rg -n "print\(" --type py
rg -n "fmt\.Print" --type go

# debugger statements
rg -n "debugger" --type ts --type js
rg -n "breakpoint\(\)" --type py
```
Map to: `AI-008` (context_length_blindness indicators)

#### Type Evasion (AI-007, AI-006)
```bash
# TypeScript any/ignore
rg -n "as any" --type ts
rg -n "as unknown as" --type ts
rg -n "@ts-ignore" --type ts
rg -n "@ts-nocheck" --type ts
rg -n "eslint-disable" --type ts --type js
```
Map to: `AI-007` (type_evasion), `AI-006` (eslint_disable_abuse)

#### Incomplete Work (QUAL-004, QUAL-009)
```bash
# TODO/FIXME markers
rg -n "TODO|FIXME|HACK|XXX" --type-add 'code:*.{ts,js,py,go,rs,java,rb}'
```
Map to: `QUAL-004` (placeholder_pollution), `QUAL-009` (incomplete_generation)

#### Error Suppression (QUAL-007)
```bash
# Empty catch blocks (basic pattern)
rg -n "catch\s*\([^)]*\)\s*\{\s*\}" --type ts --type js
rg -n "except:\s*pass" --type py
rg -n "catch\s*\{[^}]*\}" --type go  # Go empty catch
```
Map to: `QUAL-007` (error_suppression)

#### Hardcoded Environment (MAINT-005)
```bash
# localhost and hardcoded paths
rg -n "localhost" --type-add 'code:*.{ts,js,py,go}'
rg -n '"/Users/' --type-add 'code:*.{ts,js,py,go}'
rg -n '"/home/' --type-add 'code:*.{ts,js,py,go}'
rg -n "127\.0\.0\.1" --type-add 'code:*.{ts,js,py,go}'
```
Map to: `MAINT-005` (hardcoded_environment)

#### AI Signature Phrases (DOC-003)
```bash
# ChatGPT-style phrases in comments
rg -n "Certainly!" --type-add 'code:*.{ts,js,py,go,md}'
rg -n "Sure!" --type-add 'code:*.{ts,js,py,go,md}'
rg -n "I'll help" --type-add 'code:*.{ts,js,py,go,md}'
rg -n "As an AI" --type-add 'code:*.{ts,js,py,go,md}'
```
Map to: `DOC-003` (ai_signature_phrases)

#### Security Blindness (QUAL-003)
```bash
# SQL injection risk patterns
rg -n 'query\s*\(' --type ts --type js  # Check for string concat
rg -n 'execute\s*\(' --type py

# Hardcoded secrets (basic patterns)
rg -n "password\s*=\s*['\"]" --type-add 'code:*.{ts,js,py,go}'
rg -n "api_key\s*=\s*['\"]" --type-add 'code:*.{ts,js,py,go}'
rg -n "secret\s*=\s*['\"]" --type-add 'code:*.{ts,js,py,go}'
```
Map to: `QUAL-003` (security_blindness)

#### Dead Code Detection (MAINT-003)

Dead code detection uses **language-specific static analysis tools** rather than regex patterns. Detect the tech stack from file extensions and run the appropriate tool.

**Tool Selection by Language:**

| Language | Tool | Install Check | Command |
|----------|------|---------------|---------|
| Python | `vulture` | `vulture --version` | `vulture <path> --min-confidence 80` |
| TypeScript/JavaScript | `knip` (primary) | `npx knip --version` | `npx knip --no-exit-code` |
| TypeScript/JavaScript | `ts-prune` (legacy fallback) | `npx ts-prune --version` | `npx ts-prune` |
| Go | `deadcode` | `deadcode -help` | `deadcode ./...` |
| Rust | `cargo-udeps` | `cargo udeps --version` | `cargo +nightly udeps` (unused deps) |
| Java | `unused-code` | via build tool | Integrated with IDE/build |

**Execution Flow:**

1. **Detect tech stack** from scanned files:
   ```bash
   # Check for language markers
   ls package.json tsconfig.json 2>/dev/null  # Node/TS project
   ls pyproject.toml setup.py requirements.txt 2>/dev/null  # Python project
   ls go.mod 2>/dev/null  # Go project
   ls Cargo.toml 2>/dev/null  # Rust project
   ```

2. **Check tool availability** and suggest installation if missing:
   ```
   [DEAD CODE] Python detected, checking for vulture...
   [DEAD CODE] vulture not found. Install with: pip install vulture
   ```

3. **Run appropriate tool** and parse output:
   ```bash
   # Python example
   vulture <SCAN_PATH> --min-confidence 80 2>&1
   
   # TypeScript/JavaScript example (knip primary, ts-prune legacy fallback)
   npx knip --no-exit-code 2>&1 || (echo "[LEGACY TOOL: ts-prune]" && npx ts-prune 2>&1)
   
   # Go example
   deadcode ./... 2>&1
   ```

4. **Parse tool output** into standard finding format. Each tool has different output formats:
   - **vulture**: `path/file.py:42: unused function 'foo' (90% confidence)`
    - **knip**: Primary analyzer; lists unused files, exports, dependencies, etc.
    - **ts-prune**: Legacy fallback only; `path/file.ts:42 - unusedExport`
   - **deadcode**: `package.Function is unused`

**If no tool available:**
```
[DEAD CODE] No dead code analysis tool found for detected languages.

Suggested installations:
  Python:     pip install vulture
  TypeScript: npm install -D knip
  Go:         go install golang.org/x/tools/cmd/deadcode@latest

Skipping dead code detection for Phase 1. Phase 2 will attempt heuristic analysis.
```

Map findings to: `MAINT-003` (dead_code_accumulation)

### Phase 1 Finding Format

For each match, create a finding:
```json
{
  "id": "<smell-id>",
  "name": "<smell-name>",
  "severity": "<from yaml>",
  "file": "<file-path>",
  "line": <line-number>,
  "description": "<what was found>",
  "fix": "<remediation from yaml>",
  "nestingDepth": <number|null>,
  "complexity": <number|null>,
  "confidence": "high|medium|low",
  "detectionMethod": "ast|regex|heuristic|degraded",
  "phase": 1
}
```

Every finding in both phases MUST include `nestingDepth`, `complexity`, `confidence`, and `detectionMethod`.
Use `null` for unknown numeric metrics.

### Phase 1 Summary

After all patterns scanned:

```
PHASE 1 COMPLETE
------------------------------------------------------------
Patterns scanned: 15
Dead code tool: <tool name or "skipped">
Files checked: <N>
Findings: <M>

[If --verbose:]
  Debug artifacts: N
  Type evasion: N
  Incomplete work: N
  Error suppression: N
  Hardcoded env: N
  AI signatures: N
  Security issues: N
  Dead code: N
```

**If `--phase 1` only:** Skip to Report Generation.

---

## Phase 2: Heuristic Detection

**Goal**: AI-assisted detection of complex patterns via parallel sub-agents.

### Sub-Agent Architecture and Work Distribution

Spawn up to 9 parallel sub-agents, one per smell category. 

**FILE COVERAGE PROTOCOL**:
- Divide the `SCAN_PATH` file list among scanners based on relevance (e.g., Performance Scanner gets files > 100 lines, Security Scanner gets `api/`, `auth/`, `db/` files).
- For general categories (Quality, Hallucination, Structure), divide the remaining files into non-overlapping batches.
- **Deduplication**: Each file SHALL be processed by at most 3 scanners to ensure coverage without excessive redundancy.
- Track which files were assigned to which scanners in the orchestrator state.

| Scanner | Category | Focus | Batch Logic |
|---------|----------|-------|-------------|
| Hallucination Scanner | HALLU-* | Phantom imports, invented methods, version confusion | All files (Batched) |
| Structure Scanner | STRUCT-* | Cargo cult patterns, context amnesia, frankencode | All files (Batched) |
| Quality Scanner | QUAL-* | Happy path only, confident incorrectness, missing corners | All files (Batched) |
| Documentation Scanner | DOC-* | Obvious comments, stale docs, copy-paste attribution | Export-heavy files |
| Dependency Scanner | DEP-* | Bloat, version roulette, phantom deps, training leakage | Config files + imports |
| Maintainability Scanner | MAINT-* | **Dead code detection**, context collapse, style whiplash, language confusion | All files (Batched) |
| AI-Specific Scanner | AI-* | Sycophantic code, context blindness, hallucinated reports | Newest files (git) |
| Performance Scanner | PERF-* | N+1 queries, excessive renders, algorithmic inefficiency | Large files (>100 lines) |
| Test Scanner | TEST-* | Magic numbers, assertion roulette, testing the mock | `tests/`, `__tests__/` |

### Sub-Agent Prompt Template

Each sub-agent receives:

```
You are a [CATEGORY] SCANNER for a slop scan.

WORKING DIRECTORY: {workdir}
All file paths are relative to this directory.
Use this as the base path for all read/glob/grep/lgrep operations.

SMELL DEFINITIONS:
<paste relevant smells from slop-smells.yaml for this category>

FILES TO SCAN:
<list of files relevant to this category - strictly non-overlapping with other sub-agents for same category>

TASK:
1. Read each file and analyze for the smell patterns in your category
2. NOVELTY CHECK:
   - If you detect an issue already found in Phase 1 (syntax pattern), ONLY report it if you provide significant semantic value beyond the regex match.
3. For each finding, provide:
   - Smell ID (e.g., QUAL-002)
   - File and line number
   - Brief description of the issue
   - Suggested fix
   - Detection metadata (`nestingDepth`, `complexity`, `confidence`, `detectionMethod`)
4. Focus on semantic issues, not syntax (Phase 1 handles syntax patterns)
5. For MAINT/STRUCT categories, explicitly evaluate deep nesting and defensive-overkill patterns.
6. Return findings as JSON array

TIMEOUT: <TIMEOUT> seconds

RETURN FORMAT:
{
  "category": "<CATEGORY>",
  "files_scanned": <N>,
  "findings": [
    {
      "id": "<smell-id>",
      "name": "<smell-name>",
      "severity": "<severity>",
      "file": "<path>",
      "line": <number>,
      "description": "<what was found>",
      "fix": "<suggestion>",
      "nestingDepth": <number|null>,
      "complexity": <number|null>,
      "confidence": "high|medium|low",
      "detectionMethod": "ast|regex|heuristic|degraded",
      "phase": 2
    }
  ]
}
```

### Sub-Agent Spawning

Use the Task tool with `subagent_type: "explore"` for each scanner:

```
Spawning Phase 2 sub-agents with work-sharing...
- Hallucination Scanner: Batch A (Files 1-20)
- Structure Scanner: Batch B (Files 21-40)
...
```

### Sub-Agent Timeout Handling

**Default timeout**: 120 seconds per sub-agent (override with `--timeout`).

**If sub-agent times out:**
- Mark category as `TIMEOUT`
- Proceed with available results
- Note in report: `[!] <Category> Scanner: TIMEOUT`

**If sub-agent fails (error/invalid response):**
- Mark category as `INCOMPLETE`
- Note in report: `[!] <Category> Scanner: FAILED - <reason>`

**If ALL sub-agents fail:**
```
[!] Heuristic analysis failed - showing automatable findings only

All Phase 2 scanners encountered errors:
- Hallucination Scanner: <error>
- Structure Scanner: <error>
...

Suggestions:
- Check system status and retry
- Run with --phase 1 for automatable detection only
```

### Phase 2 Summary

```
PHASE 2 COMPLETE
------------------------------------------------------------
Sub-agents spawned: 9
Work distribution: 100% file coverage achieved
Successful: <N>
Timed out: <N>
Failed: <N>
Total findings: <M>
```

---

## Report Generation

> **Anti-Loop Protocol**: After Phase 2 sub-agents complete, proceed directly to aggregation. Skip prose summaries—go straight to combining and sorting findings below.

### Aggregate and Deduplicate Findings

1. Combine Phase 1 and Phase 2 findings.
2. **NOVELTY DETECTION AND DEDUPLICATION**:
   - For findings in the same file:line with the same smell ID, merge into a single entry.
   - Prefer Phase 2 (heuristic) description if available, as it typically provides more context.
   - Cross-scanner deduplication: If multiple scanners report different issues on the same line, keep all (they may be different problems), but if they report the same problem, deduplicate.
3. Sort by severity: CRITICAL > HIGH > MEDIUM > LOW
4. Group by severity level
5. Calculate summary statistics (Unique issue count per category)
6. Calculate **Scanner Convergence**: Note if multiple scanners agreed on a specific finding (high-confidence).

### Text Report Format

```
============================================================
              SLOP SCAN REPORT
============================================================

SCAN SCOPE: <N> files in <path>
PHASE 1: <N> findings | PHASE 2: <M> findings

SUMMARY BY SEVERITY
------------------------------------------------------------
CRITICAL: <N> | HIGH: <N> | MEDIUM: <N> | LOW: <N>

SUMMARY BY CATEGORY
------------------------------------------------------------
Quality (QUAL): <N> | Hallucination (HALLU): <N> | Structure (STRUCT): <N>
Documentation (DOC): <N> | AI-Specific (AI): <N> | Maintainability (MAINT): <N>
Performance (PERF): <N> | Test (TEST): <N> | Dependency (DEP): <N>

[If any Phase 2 scanner issues:]
[!] INCOMPLETE SCANNERS: <list>

CRITICAL FINDINGS
------------------------------------------------------------
[QUAL-003] security_blindness
  src/api/auth.ts:42
  SQL query built with string concatenation
  FIX: Use parameterized queries or an ORM

[DEP-004] training_data_leakage
  src/config/api.ts:15
  Hardcoded API key that appears to be from training data
  FIX: Use environment variables for secrets

HIGH FINDINGS
------------------------------------------------------------
[AI-007] type_evasion
  src/utils/parser.ts:89
  Excessive use of 'as any' bypassing type safety
  FIX: Define proper types or use type guards

[QUAL-007] error_suppression
  src/handlers/upload.ts:156
  Empty catch block silently swallows errors
  METHOD: regex | CONFIDENCE: medium | NESTING: null | COMPLEXITY: null
  FIX: Log error and/or rethrow with context

MEDIUM FINDINGS
------------------------------------------------------------
[QUAL-004] placeholder_pollution
  src/services/email.ts:23
  TODO marker: "TODO: implement email validation"
  FIX: Implement the functionality or remove the code

LOW FINDINGS
------------------------------------------------------------
[DOC-003] ai_signature_phrases
  src/components/Button.tsx:5
  AI-generated comment: "Certainly! This component..."
  FIX: Rewrite comment in project style

============================================================
NEXT STEPS:
1. Fix CRITICAL issues immediately (security risk)
2. Address HIGH issues before merging
3. Consider MEDIUM issues for code quality
4. LOW issues are optional improvements
============================================================
```

### No Findings Report

```
============================================================
              SLOP SCAN REPORT
============================================================

SCAN SCOPE: <N> files in <path>
PHASE 1: 0 findings | PHASE 2: 0 findings

[OK] No slop detected. Code looks clean!

============================================================
```

### JSON Report Format

**If `--json` flag set:**

```json
{
  "scope": {
    "files": 42,
    "path": "."
  },
  "phases": {
    "phase1": { "enabled": true, "findings": 5 },
    "phase2": { "enabled": true, "findings": 10, "incomplete": ["Performance"] }
  },
  "summary": {
    "total": 15,
    "bySeverity": {
      "critical": 1,
      "high": 5,
      "medium": 7,
      "low": 2
    },
    "byCategory": {
      "QUAL": 8,
      "HALLU": 2,
      "AI": 3,
      "DOC": 2
    }
  },
  "findings": [
    {
      "id": "QUAL-003",
      "name": "security_blindness",
      "severity": "critical",
      "file": "src/api/auth.ts",
      "line": 42,
      "description": "SQL query built with string concatenation",
      "fix": "Use parameterized queries or an ORM",
      "nestingDepth": null,
      "complexity": null,
      "confidence": "high",
      "detectionMethod": "regex",
      "phase": 1
    }
  ]
}
```

---

## Verbose Mode

**If `--verbose` flag set**, output additional progress:

```
[VERBOSE] Enumerating files...
[VERBOSE] Found 142 source files, 23 excluded
[VERBOSE] Loading slop-smells.yaml (52 patterns)

[VERBOSE] Phase 1: Scanning debug artifacts...
[VERBOSE]   console.log: 5 matches
[VERBOSE]   debugger: 0 matches
[VERBOSE] Phase 1: Scanning type evasion...
[VERBOSE]   as any: 12 matches
...

[VERBOSE] Phase 2: Spawning sub-agents...
[VERBOSE]   Hallucination Scanner: started (15 files)
[VERBOSE]   Quality Scanner: started (42 files)
...
[VERBOSE]   Hallucination Scanner: complete (2 findings, 8.3s)
[VERBOSE]   Quality Scanner: complete (5 findings, 12.1s)
...

[VERBOSE] Timing:
[VERBOSE]   File enumeration: 0.2s
[VERBOSE]   Phase 1: 3.4s
[VERBOSE]   Phase 2: 45.2s
[VERBOSE]   Report generation: 0.1s
[VERBOSE]   Total: 48.9s
```

---

## Debug Mode

**If `ADV_DEBUG=1` environment variable set**, output to stderr:

```
[DEBUG] Raw sub-agent prompt for Quality Scanner:
<full prompt text>

[DEBUG] Raw sub-agent response from Quality Scanner:
<full response text>

[DEBUG] Pattern match context for QUAL-007:
  File: src/handlers/upload.ts
  Line 156: } catch (e) { }
  Context: lines 154-158
```

---

## Execution

Now execute the slop scan.

1. Parse arguments and validate
2. Run pre-flight checks (git, yaml, files)
3. If Phase 1 enabled: Run automatable detection
4. If Phase 2 enabled: Spawn sub-agents for heuristic detection
5. Aggregate findings and generate report
6. Output in requested format (text or JSON)

Begin with argument parsing.

---

## Completion Banner

After the report is generated, emit:

```
============================================================
      /adv-slop-scan COMPLETE
============================================================
Result: <N findings | No slop detected>

  ⚡ Recommended next step (Refine agent):
     /adv-harden {change-id}
============================================================
```
