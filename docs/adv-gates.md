# ADV 6-Gate Quality Checklist

All changes must complete 6 sequential quality gates before archival.

## Gate Sequence

| # | Gate ID | Name | Triggered By |
|---|---------|------|--------------|
| 1 | `research` | Research-Done | `/adv-research` or Context7 lookup |
| 2 | `prep` | Prep-Done | `/adv-prep` |
| 3 | `implementation` | Implementation-Done | All tasks done |
| 4 | `review` | Review-Done | `/adv-review` |
| 5 | `harden` | Harden-Done | `/adv-harden` |
| 6 | `signoff` | User-Signoff | Explicit user confirmation |

## Gate Status Values

| Value | Meaning |
|-------|---------|
| `pending` | Not yet completed |
| `done` | Completed with timestamp + actor evidence |
| `legacy` | Predates gate system, counts as "satisfied" |
| `skipped` | Explicitly skipped with documented reason |

## Enforcement Rules

1. **Sequential**: Gates MUST be completed in order (cannot skip ahead)
2. **Blocking**: Archive/Complete BLOCKS unless all 6 gates satisfied
3. **Cancelled Tasks**: At `implementation` gate, cancelled tasks need user approval
4. **Legacy Support**: `legacy` status counts as "satisfied" for sequence enforcement
5. **Migration**: Existing changes get `legacy` status (except `signoff` stays `pending`)

## Gate-Specific Pre-Checks

### Harden Gate

Before running quality scanners, `/adv-harden` performs these pre-flight checks (in order):

1. **Review gate prerequisite** — review gate must be complete
2. **Cancellation & cross-repo audit** — all cancelled tasks need approval, cross-repo tasks must be done
3. **Review findings audit** — actionable findings must be resolved or documented as accepted debt
4. **Merge compatibility check** — non-destructive dry-run merge against the default branch (`git merge --no-commit --no-ff`); blocks on conflicts so they are caught before quality analysis, not at archive time

## Auto-Completion

When a command is invoked with incomplete prerequisite gates:

| Missing Gate | Auto-Execute | Lightweight Version |
|--------------|--------------|---------------------|
| `research` | Context7 docs lookup | Query relevant library docs |
| `prep` | Quick prep analysis | Scan affected files for conflicts |

User is notified before auto-completing gates.

## Checking Gate Status

```bash
# View gate status for a change
adv_gate_status({ changeId: "my-change" })

# Complete a gate
adv_gate_complete({ changeId: "my-change", gateId: "research" })
```
