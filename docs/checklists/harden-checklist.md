# Harden Checklist

Referenced by `/adv-harden`. Enforces adversarial rigor to prevent shallow "all clear" hardening passes.

---

## 6-Scanner Coverage

Every hardening pass MUST run all 6 scanners. Mark `[x]` when analyzed (even if no findings):

- [ ] **Test Coverage** — File-level coverage ratio, TDD evidence audit
- [ ] **AI-Slop Detection** — Placeholders, type erosion, naive patterns, structural issues
- [ ] **Documentation Hygiene** — Conflict detection, staleness audit, deletion of superseded docs, succinct long-term updates
- [ ] **Cleanup** — Temp files, debug code, dead imports, orphaned tests
- [ ] **Production Readiness** — Security, reliability, performance, maintainability
- [ ] **Deployment Readiness** — Env vars, migrations, external services, CI/CD, infrastructure, feature flags, deployment steps

**Minimum**: All 6 must be executed. Skipping a scanner requires explicit justification (e.g., "Cleanup: N/A — no file artifacts in this change").

---

## Severity Scoring

Every finding MUST be scored using Impact x Effort:

| Severity | Criteria |
|----------|----------|
| `BLOCKER` | Security risk, data loss, crashes |
| `HIGH` | Silent failures, maintainability crisis |
| `MEDIUM` | Technical debt accumulation |
| `LOW` | Style issues, minor inefficiencies |

### Priority Matrix (Impact x Effort)

```
Impact (1-5): Security=5, Production=4, Friction=3, Debt=2, Style=1
Effort (1-5): <1hr=5, <1day=4, <1week=3, <1sprint=2, >1sprint=1

Priority = Impact x Effort
  20-25: Critical (fix immediately)
  12-19: High (this sprint)
  6-11:  Medium (next sprint)
  1-5:   Low (backlog)
```

---

## Minimum Findings Threshold

**Requirement**: At least **3 non-nit findings** per hardening pass.

Non-nit = `BLOCKER`, `HIGH`, `MEDIUM`, or any actionable finding (not purely cosmetic).

### If fewer than 3 non-nit findings

The reviewer MUST provide a **genuinely-clean justification** with file-level evidence:

```
GENUINELY CLEAN JUSTIFICATION:

Scanners run:
- Test Coverage: 100% file coverage (5/5 files have tests), TDD evidence present
- AI-Slop: 0 findings — no placeholders, type erosion, or naive patterns detected
- Documentation: README current, inline docs 85% coverage, CHANGELOG entry present
- Cleanup: 0 candidates — no temp files, debug code, or dead imports
- Production Readiness: All gates pass (security, reliability, performance, maintainability)

Why this is genuinely clean:
- Change is small and well-scoped ({N} files, {M} lines changed)
- All code follows established patterns (no novel architecture)
- Full TDD cycle completed with red/green evidence
- No external dependencies added
- No security surface changes
```

**Red flags that invalidate "genuinely clean":**
- Change touches > 500 lines
- Introduces new external dependencies
- Contains any `TODO` or `FIXME` in implementation paths
- Has files without corresponding tests
- Contains `any` type assertions (TypeScript)
- Missing TDD evidence for logic-heavy tasks

---

## Status Determination

| Status | Criteria |
|--------|----------|
| **READY** | No BLOCKER, no HIGH, <=3 MEDIUM |
| **NEEDS_WORK** | No BLOCKER but HIGH or >3 MEDIUM |
| **BLOCKED** | Any BLOCKER |

---

## Documentation Hygiene Standard

Docs are agent infrastructure — stale docs actively harm every future session. The harden pass enforces:

1. **Delete > Update**: If a doc is >80% stale or superseded, delete it. Fewer accurate docs beat many outdated ones.
2. **No Conflicts**: Any doc that contradicts the implementation is a BLOCKER. Fix or delete immediately.
3. **No Duplication**: Information lives in ONE canonical location. Remove copies elsewhere.
4. **Succinct**: Docs should be scannable in <30 seconds. Tables and bullet lists over prose. No filler.
5. **Long-term Value**: Only document what an agent needs to know across sessions — commands, constraints, patterns, defaults. Omit transient details.

**Red flags (escalate to BLOCKER/HIGH):**
- Doc references deleted files, functions, or commands
- Two docs describe the same behavior differently
- Generated reports (HTML, comparison docs) not auto-regenerated and now outdated
- README re-explains what inline docs already cover

---

## Technical Debt Classification

If accepting debt, classify using Fowler's quadrant:

| | Prudent | Reckless |
|---|---------|----------|
| **Deliberate** | "Ship now, fix later" — Track with payoff date | "No time for design" — Escalate |
| **Inadvertent** | "Now we know better" — Refactor soon | "What's layering?" — Training needed |

Accepted debt MUST be documented in `proposal.md` with:
- Debt type and quadrant classification
- Interest rate estimate (cost of not fixing)
- Planned payoff date
