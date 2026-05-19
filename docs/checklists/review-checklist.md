# Review Checklist

Referenced by `/adv-review`. Enforces adversarial rigor to prevent shallow "LGTM" reviews.

---

## 12-Dimension Coverage

Every review MUST explicitly assess each dimension. Mark `[x]` when analyzed (even if no findings):

- [ ] **Design** — Architecture, system integration, timing
- [ ] **Functionality** — Correctness, edge cases, concurrency
- [ ] **Complexity** — Understandable quickly? Over-engineered?
- [ ] **Tests** — Coverage adequate? Tests actually fail when code breaks?
- [ ] **Naming** — Clear, communicative, appropriate length
- [ ] **Comments** — Explain "why" not "what"
- [ ] **Style** — Conformance to project style guide
- [ ] **Documentation** — READMEs, API docs updated
- [ ] **Security** — Auth, validation, secrets, OWASP top 10
- [ ] **Performance** — Degradation risks, optimization opportunities
- [ ] **Error Handling** — Correct approach, user-friendly, debuggable
- [ ] **Consistency** — Matches existing patterns

**Minimum**: All 12 must be checked. Skipping a dimension requires explicit justification (e.g., "Security: N/A — no user input or auth changes").

---

## Conventional Comment Labels

Every finding MUST use exactly one label:

| Label | Meaning | Blocking? |
|-------|---------|-----------|
| `blocker:` | Must fix before merge | YES |
| `issue:` | Should fix, real problem | YES |
| `suggestion:` | Would improve code | NO |
| `nit:` | Minor style/preference | NO |
| `question:` | Need clarification | MAYBE |
| `praise:` | Good work worth noting | NO |

### Comment Structure

```
{label}: [{file}:{line}] {what}
  Why: {why}
  Fix: {how} (optional)
```

---

## Minimum Findings Threshold

**Requirement**: At least **3 non-nit findings** per review.

Non-nit = `blocker:`, `issue:`, `suggestion:`, or `question:`.

### If fewer than 3 non-nit findings

The reviewer MUST provide a **genuinely-clean justification** with file-level evidence:

```
GENUINELY CLEAN JUSTIFICATION:

Files reviewed:
- src/foo.ts (142 lines) — No issues: straightforward CRUD, follows existing patterns
- src/bar.ts (87 lines) — No issues: thin wrapper with full test coverage
- src/baz.test.ts (203 lines) — No issues: comprehensive assertions, edge cases covered

Why this is genuinely clean:
- Change is small and well-scoped ({N} files, {M} lines changed)
- Follows established patterns with no novel logic
- Full test coverage verified via TDD evidence
- No security surface (no user input, no auth, no external calls)
```

**Red flags that invalidate "genuinely clean":**
- Change touches > 500 lines
- Introduces new architectural patterns
- Handles user input or authentication
- Modifies public API surface
- Has no test coverage

---

## Verdict Criteria

| Verdict | Criteria |
|---------|----------|
| **BLOCKED** | Any `blocker:` findings |
| **CHANGES_REQUESTED** | Any `issue:` findings (no blockers) |
| **APPROVED** | Only `suggestion:` / `nit:` / `praise:` / none |

### Mandatory Remediation Before Final Verdict

If any actionable findings exist (`blocker:`, `issue:`, `suggestion:`, `question:`), `/adv-review` must run remediation before finalizing:

- [ ] **Non-trivial fixes researched** — fixes that change control flow, security code, interfaces, or span 3+ files must be validated by a research sub-agent (librarian/adv-researcher) or inline research (Context7/Exa/lgrep) before applying. See Fix Validation Protocol in `adv-review.md`.
- [ ] **All blockers/issues fixed** — every blocking finding is implemented and verified
- [ ] **All suggestions/questions investigated** — each has `validated` or `rejected_with_evidence` outcome
- [ ] **Validated suggestions implemented** — no validated suggestion left unapplied
- [ ] **No future-work deferral** — validated in-scope findings are fixed or rejected with evidence; × no report-only, future-work, or accepted-debt path for validated in-scope findings
- [ ] **Cleanup completed** — temp/debug/dead-code artifacts removed from remediation scope
- [ ] **Verdict recomputed after fixes** — final verdict reflects post-remediation state, not initial scan

`nit:` findings remain optional and do not block approval.

### Approval Threshold

Approve when the change "definitely improves overall code health," even if imperfect.

**Block only on:**
- Security vulnerabilities
- Correctness bugs
- Code that degrades system health
- Missing tests for risky changes

**Don't block on:**
- Personal style preferences not in style guide
- Minor optimizations that aren't critical
- "Better" ways that are functionally equivalent

---

## Sub-Agent Failure Handling

When sub-agents return empty or interrupted results, the review MUST NOT silently pass.

### Verification Step

Before emitting the final verdict, verify each sub-agent dimension produced real output:

- [ ] **Requirement Traceability** — result contains `"dimension": "requirement_traceability"` and `coverage_percent`
- [ ] **Logic & Edge Cases** — result contains `"dimension": "logic_review"` and `issues` array
- [ ] **Security** — result contains `"dimension": "security_review"` and `issues` array
- [ ] **Architecture & Quality** — result contains `"dimension": "architecture_conformance"` and `issues` array
- [ ] **Cross-Repo Verification** — result contains `"dimension": "cross_repo_verification"` and `status`

### If a dimension is missing

Follow the resilience protocol in `adv-review.md`:
1. Retry the sub-agent once
2. If retry fails, perform inline analysis for that dimension
3. Never emit a verdict with a dimension unanalyzed

**A review with unanalyzed dimensions is invalid** — it cannot be used to mark the review gate complete.
