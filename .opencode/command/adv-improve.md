---
name: adv-improve
description: Analyze codebase for architectural improvements with greenfield perspective
agent: general
---

# ADV Improve - Architectural Improvement Analysis

> **SUB-AGENT CONTEXT**: Return findings directly. Status markers and CONTRACT STATUS blocks are for main sessions only—omit them to maximize your output buffer.

You are performing an **architectural improvement analysis** with a unique dual perspective:

1. **Current State Analysis** - What gaps exist in the codebase today?
2. **Greenfield Perspective** - If rebuilding from scratch for pre-production launch, what would you do differently?

This dual lens helps identify both tactical fixes and strategic architectural improvements.

---

## Phase 0: Project Understanding

Before analyzing, understand the project's context.

### Step 0.1: Read Project Documentation

Read available documentation files:

```bash
# Check for documentation files
ls README.md AGENTS.md 2>/dev/null
```

### Step 0.2: Extract and Display Context

**If README.md exists:**
- Read content (truncate to ~2000 chars if very long; add "(truncated)" note)
- Extract purpose from first paragraph or `## Purpose` section

**If only AGENTS.md exists:**
- Note: "Source: AGENTS.md (no README.md found)"

**If neither exists:**
- Note: "No project documentation found"
- Suggest: "Consider adding README.md"
- Proceed with all categories enabled

### Step 0.3: Output Context Summary

```
PROJECT CONTEXT
------------------------------------------------------------
Purpose: <extracted from README first paragraph or ## Purpose>
Source: <README.md | README.md (truncated) | AGENTS.md | No documentation found>
Stage: <startup | growth | mature | legacy> (inferred from code patterns)
Key constraints identified:
  - <constraint 1, if any found>
  - <constraint 2, if any found>
  - (none identified) if no explicit constraints found
------------------------------------------------------------
```

---

## Pre-flight Check

### Step 1: Verify Project Structure

```bash
# Look for common source directories
ls -d src/ lib/ app/ packages/ 2>/dev/null || ls *.ts *.js *.py *.go 2>/dev/null | head -5
```

**If no source files found:**
```
No source files found to analyze.
Please check that you're in the correct project directory.
```
Then STOP.

### Step 2: Detect Technology Stack

Examine project files:
- `package.json` → Node.js/TypeScript
- `requirements.txt` / `pyproject.toml` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `pom.xml` / `build.gradle` → Java

Note detected tools and ecosystem maturity.

---

## Part 1: Current State Analysis

Analyze the codebase for gaps across **6 core categories**.

### Core Categories

#### 1. Security Posture
- Input handling and validation patterns
- Authentication/authorization implementation
- Secrets management approach
- Dependency vulnerability exposure
- Common vulnerability patterns (injection, XSS, CSRF)

#### 2. Reliability
- Error handling and recovery patterns
- Retry logic and circuit breakers
- Graceful degradation strategies
- Fault isolation and blast radius
- Timeout handling for external calls

#### 3. Testing Maturity
- Test organization and coverage strategy
- Test reliability (flakiness, isolation, determinism)
- Test performance (speed, parallelization)
- Testing depth (unit, integration, E2E, property-based)

#### 4. Observability
- Logging strategy and structure
- Error tracking and reporting
- Metrics and monitoring hooks
- Debugging capabilities
- Health checks and readiness probes

#### 5. Developer Experience
- Onboarding documentation
- Local development setup
- Contribution guidelines
- Test running convenience
- Debug tooling

#### 6. Code Quality & Maintainability
- Consistent code style and patterns
- Clear module boundaries
- Documentation coverage
- Type safety utilization
- Naming conventions

---

## Part 2: Architecture Health Assessment (By-the-Book)

**This is not a subjective review.** Compare the existing architecture against the **canonical reference architecture** for the project's tech stack. Use Context7 (`resolve-library-id`, `query-docs`) and authoritative documentation to determine what "correct" looks like.

### 2.1 Reference Architecture Lookup (CRITICAL)

For the detected tech stack, look up the **canonical/reference architecture**:

1. **Use Context7** to query the framework's official documentation for recommended project structure, layer patterns, and architectural guidance
2. **Identify the reference architecture** — what does the framework/ecosystem recommend?
   - Layer boundaries (e.g., controller → service → repository)
   - Dependency direction (dependencies point inward toward domain)
   - Separation of concerns (business logic isolated from I/O, transport, persistence)
   - Error handling strategy (centralized vs. distributed, typed errors vs. exceptions)
   - Observability patterns (where logs/traces/metrics belong in the architecture)
   - Configuration management (environment-based, validated at startup)
   - Module/package organization (by feature vs. by layer vs. hybrid)

3. **Document the reference** with source citations:
   ```
   REFERENCE ARCHITECTURE: {framework/stack}
   Source: {official docs URL or Context7 library}
   
   Recommended structure:
   - {layer/pattern}: {description}
   - {layer/pattern}: {description}
   ```

### 2.2 Architecture Deviation Analysis

For each architectural area, compare existing vs. reference and classify:

| Area | Existing Pattern | Reference Pattern | Classification | Source |
|------|-----------------|-------------------|----------------|--------|
| Layer boundaries | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |
| Dependency direction | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |
| Separation of concerns | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |
| Error handling | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |
| Observability | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |
| Module organization | {what exists} | {what's correct} | SOUND / DRIFTED / ANTI-PATTERN | {citation} |

**Classification criteria:**
- `SOUND` — Follows best practices, safe to extend
- `DRIFTED` — Was good, has accumulated inconsistencies that compound over time
- `ANTI-PATTERN` — Fundamentally wrong, every new feature built on it makes things worse

### 2.3 Architecture Corrections

**For each DRIFTED or ANTI-PATTERN area**, produce a correction recommendation:

1. **What is wrong** — Specific deviation with file path evidence
2. **What is correct** — The by-the-book approach with authoritative source
3. **Why it matters** — Concrete consequences of continuing the current pattern
4. **Correction scope:**
   - `TARGETED` — Can be fixed in a single focused change
   - `INCREMENTAL` — Requires multiple changes, new code should follow correct pattern
   - `REWRITE` — Area needs fundamental restructuring
5. **Minimum viable correction** — The smallest change that stops the bleeding (prevents new code from perpetuating the anti-pattern)

**IMPORTANT**: Architecture corrections are NOT optional "nice-to-haves." DRIFTED areas should be flagged as HIGH severity. ANTI-PATTERN areas should be flagged as CRITICAL. These take priority in the recommendations.

### 2.4 Greenfield Perspective

**The Critical Question**: If you were building this project from scratch today, knowing what you know about the domain, what would you do differently?

Evaluate current architecture against modern alternatives:

| Aspect | Evaluate |
|--------|----------|
| **Data Model** | Would you structure data differently? Different relationships? |
| **API Design** | REST vs GraphQL vs tRPC? Different endpoint structure? |
| **State Management** | Different patterns? Simpler approach? |
| **Module Boundaries** | Different package/folder structure? |
| **Dependency Choices** | Different libraries knowing their current limitations? |

### 2.5 Technical Debt Assessment

Identify debt that would not exist in a greenfield rewrite:

| Debt Type | Question |
|-----------|----------|
| **Evolutionary Cruft** | What exists only because of incremental changes? |
| **Framework Lock-in** | What patterns are workarounds for framework limitations? |
| **Legacy Support** | What code exists only for backward compatibility? |
| **Premature Abstractions** | What abstractions weren't needed? |
| **Missing Abstractions** | What abstractions are needed but missing? |

### 2.6 Pre-Production Launch Readiness

If launching to production users tomorrow, what's missing?

| Area | Check |
|------|-------|
| **Error Handling** | Does every error path have a user-facing recovery? |
| **Performance** | Any obvious bottlenecks or N+1 queries? |
| **Security** | Rate limiting? Auth on all routes? Input validation? |
| **Operations** | Can you deploy with confidence? Rollback? |
| **Monitoring** | Will you know when something breaks? |

---

## Evidence Requirements

**Every finding MUST include evidence.** Findings without evidence are rejected.

| Claim Type | Required Evidence |
|------------|-------------------|
| "X exists" | File path where found |
| "X does not exist" | Directories/patterns searched |
| "Pattern Y is used" | 1-3 example file paths |
| "Configuration Z is present" | Config file path + key |

**Good Evidence:**
- `src/routes/users.ts:45` - specific location
- `Searched src/**/*.ts - no retry patterns found`
- `package.json: no "test:e2e" script defined`

**Bad Evidence (rejected):**
- "The codebase lacks tests" (no search evidence)
- "Architecture is outdated" (no specifics)

---

## Severity Assignment

| Severity | Criteria |
|----------|----------|
| **CRITICAL** | Security vulnerabilities, data loss risks, system instability |
| **HIGH** | Significant gaps affecting reliability, maintainability, or velocity |
| **MEDIUM** | Notable improvements that would strengthen the codebase |
| **LOW** | Minor enhancements or best practice suggestions |
| **GREENFIELD** | Would be different in a rewrite (not necessarily a current bug) |

---

## Output Format

```
============================================================
                 IMPROVEMENT ANALYSIS
============================================================

PROJECT CONTEXT
------------------------------------------------------------
Purpose: <purpose>
Source: <source>
Stage: <stage>
Stack: <detected technologies>
------------------------------------------------------------

PART 1: CURRENT STATE GAPS
============================================================

[CRITICAL] <Brief Finding Title>
  Category: <Security | Reliability | Testing | Observability | DX | Quality>
  Observation: <What you found or didn't find>
  Evidence: <Specific file paths, patterns, or search scope>
  Impact: <Why this matters>
  Suggested Research: <search terms for solutions>

[HIGH] <Brief Finding Title>
  Category: <category>
  Observation: <observation>
  Evidence: <evidence>
  Impact: <impact>
  Suggested Research: <search terms>

... (continue for each finding, sorted by severity)

PART 2: ARCHITECTURE HEALTH & GREENFIELD PERSPECTIVE
============================================================

REFERENCE ARCHITECTURE
------------------------------------------------------------
Stack: <detected tech stack>
Source: <authoritative documentation / Context7 library>
Key patterns: <canonical layer/structure recommendations>

ARCHITECTURE DEVIATION ANALYSIS
------------------------------------------------------------

| Area | Existing | Reference | Class | Source |
|------|----------|-----------|-------|--------|
| <area> | <pattern> | <correct> | SOUND/DRIFTED/ANTI-PATTERN | <cite> |

ARCHITECTURE CORRECTIONS (ordered by severity)
------------------------------------------------------------

[CRITICAL] <Anti-Pattern Area>
  Existing: <what the code does>
  Reference: <what it should do, with source>
  Evidence: <file paths>
  Impact: <consequences of continuing>
  Scope: <TARGETED | INCREMENTAL | REWRITE>
  Minimum Viable Correction: <smallest fix to stop the bleeding>

[HIGH] <Drifted Area>
  Existing: <what the code does>
  Reference: <what it should do, with source>
  Evidence: <file paths>
  Impact: <consequences of continuing>
  Scope: <TARGETED | INCREMENTAL | REWRITE>
  Minimum Viable Correction: <smallest fix to stop the bleeding>

GREENFIELD CHANGES
------------------------------------------------------------

[GREENFIELD] <What Would Change>
  Current: <How it is now>
  Evidence: <file paths showing current approach>
  Alternative: <What a greenfield build would do>
  Why: <Benefits of the alternative>
  Migration Effort: <low | medium | high | rewrite>

[GREENFIELD] <Another Change>
  ...

TECHNICAL DEBT REMOVAL
------------------------------------------------------------

[DEBT] <Debt Item>
  Type: <Evolutionary | Lock-in | Legacy | Premature | Missing>
  Location: <file paths>
  Origin: <Why this debt exists - if discernible>
  Removal Strategy: <How to eliminate it>
  Effort: <trivial | small | medium | large>

PRE-PRODUCTION LAUNCH GAPS
------------------------------------------------------------

[LAUNCH] <Gap Title>
  Risk: <What could go wrong without this>
  Current State: <What exists now>
  Required: <What's needed for production>
  Priority: <must-have | should-have | nice-to-have>

============================================================
                      SUMMARY
============================================================

Architecture Health: <N SOUND, N DRIFTED, N ANTI-PATTERN areas>
Current State Issues: <N total - X critical, Y high, Z medium>
Architecture Corrections: <N required (prioritize these)>
Greenfield Changes: <N architectural differences identified>
Technical Debt Items: <N items totaling ~X effort>
Launch Blockers: <N must-haves, M should-haves>

Top 3 Recommendations (architecture corrections first):
1. <Most impactful improvement>
2. <Second priority>
3. <Third priority>

============================================================
```

### When No Significant Issues Found

```
============================================================
                 IMPROVEMENT ANALYSIS
============================================================

PROJECT CONTEXT
------------------------------------------------------------
<context>
------------------------------------------------------------

ASSESSMENT: PRODUCTION READY

This codebase demonstrates mature engineering practices:

Current State:
- Security: <brief positive finding>
- Reliability: <brief positive finding>
- Testing: <brief positive finding>
- Observability: <brief positive finding>
- DX: <brief positive finding>

Architecture Health:
All areas classified as SOUND against reference architecture.
Source: <authoritative docs consulted>

Greenfield Assessment:
The current architecture aligns well with modern best practices.
No significant architectural changes would be made in a rewrite.

Minor Opportunities:
- <optional small improvement>
- <optional small improvement>

============================================================
```

---

## Timeout Handling

For very large codebases:

1. **Output partial findings** gathered so far
2. **Add truncation notice**:

```
============================================================
Analysis truncated due to time constraints.

Findings gathered before truncation:
[... partial findings ...]

Recommendation: Run on specific directories for deeper analysis.
============================================================
```

---

## Execution

1. **Phase 0**: Read project documentation
2. **Output PROJECT CONTEXT** summary
3. Run pre-flight checks
4. **Part 1**: Analyze current state (6 categories)
5. **Part 2**: Architecture health and greenfield perspective
   - **Reference architecture lookup** via Context7 (CRITICAL — do this first)
   - Architecture deviation analysis (SOUND / DRIFTED / ANTI-PATTERN)
   - Architecture corrections for deviations
   - Greenfield architectural alternatives
   - Technical debt identification
   - Launch readiness check
6. Generate summary and top recommendations (architecture corrections first)
7. Output the complete report

---

## Creating Changes from Findings

After the analysis, significant findings can become ADV changes:

```
To create a change from any finding, use:

  adv_change_create({ summary: "<finding title>" })

Then add tasks for the remediation work:

  adv_task_add({ changeId: "...", content: "<specific fix>" })
```

---

## Completion Banner

```
============================================================
       /adv-improve COMPLETE
============================================================
Result: <N findings | Production ready>
Changes suggested: <Y>
============================================================
```
