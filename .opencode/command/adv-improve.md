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

## Part 2: Greenfield Perspective

**The Critical Question**: If you were building this project from scratch today, knowing what you know about the domain, what would you do differently?

### 2.1 Architectural Decisions

Evaluate current architecture against modern alternatives:

| Aspect | Evaluate |
|--------|----------|
| **Data Model** | Would you structure data differently? Different relationships? |
| **API Design** | REST vs GraphQL vs tRPC? Different endpoint structure? |
| **State Management** | Different patterns? Simpler approach? |
| **Module Boundaries** | Different package/folder structure? |
| **Dependency Choices** | Different libraries knowing their current limitations? |

### 2.2 Technical Debt Assessment

Identify debt that would not exist in a greenfield rewrite:

| Debt Type | Question |
|-----------|----------|
| **Evolutionary Cruft** | What exists only because of incremental changes? |
| **Framework Lock-in** | What patterns are workarounds for framework limitations? |
| **Legacy Support** | What code exists only for backward compatibility? |
| **Premature Abstractions** | What abstractions weren't needed? |
| **Missing Abstractions** | What abstractions are needed but missing? |

### 2.3 Pre-Production Launch Readiness

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

PART 2: GREENFIELD PERSPECTIVE
============================================================

If rebuilding this project from scratch today:

ARCHITECTURAL CHANGES
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

Current State Issues: <N total - X critical, Y high, Z medium>
Greenfield Changes: <N architectural differences identified>
Technical Debt Items: <N items totaling ~X effort>
Launch Blockers: <N must-haves, M should-haves>

Top 3 Recommendations:
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
5. **Part 2**: Apply greenfield perspective
   - Architectural alternatives
   - Technical debt identification
   - Launch readiness check
6. Generate summary and top recommendations
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
