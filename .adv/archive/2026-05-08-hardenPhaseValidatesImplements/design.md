## Design

### File 1: `.opencode/command/adv-harden.md`

**Change A: New "Review Findings Ingestion" section after Pre-flight, before Phase 1**

Insert between current "Worktree Context Propagation" (line ~134) and "Technical Debt Quadrant" (line ~138):

```
### Review Findings Ingestion

Before running 6-scanner analysis, validate and act on review suggestions/questions.

**Step 1:** Load all `REVIEW_FINDINGS` findings with labels `suggestion:` and `question:` that have `status: unresolved`.

**Step 2: Validate each finding:**
- Re-read the referenced file:line in current codebase
- Check against specs (`adv_spec action: "show"`), acceptance criteria, and existing tests
- Determine validity:

| Classification | Criteria | Action |
|---|---|---|
| `valid` | Finding still applies; code would genuinely improve | Queue for implementation |
| `invalid` | Code already handles this, finding based on stale context, or contradicts specs | Mark `rejected_with_evidence`, document why |
| `already_fixed` | Subsequent task or review remediation already addressed it | Mark `fixed`, cite evidence |

**Step 3: Implement valid findings:**
- Apply drift-detection rule (same as Phase 3) before each fix
- If no drift → implement via `adv-engineer` sub-agent or inline
- If drift → STOP, present to user via `question` tool
- After implementation → mark `fixed` with fix notes

**Step 4: Emit updated `REVIEW_FINDINGS`** with new statuses for all processed findings.

**Skip condition:** If no `suggestion:`/`question:` findings with `status: unresolved` exist → emit REVIEW FINDINGS INGESTION: NONE banner → proceed to Phase 1.

**Integration with Review Findings Audit:** The existing "Review Findings Audit" section (pre-flight) continues to block on unresolved `blocker:`/`issue:` findings. This new ingestion step handles `suggestion:`/`question:` items. Together they ensure ALL non-nit findings reach terminal status.
```

**Change B: Update "Review Findings Audit" section (lines 94-109)**

Add a note clarifying scope split:
```
> **Scope note:** `blocker:` and `issue:` findings are checked here (pre-flight). `suggestion:` and `question:` findings are validated and implemented in "Review Findings Ingestion" below. `nit:` findings are excluded from both.
```

### File 2: `.opencode/command/adv-review.md`

**Change C: Update APPROVED verdict notes (around line 183)**

After "Approve when change 'definitely improves overall code health.'" add:

```
When APPROVED with unresolved `suggestion:` or `question:` findings, note in `REVIEW_FINDINGS` that these are deferred to `/adv-harden` for validation and implementation. The harden phase will validate each and either implement or reject with evidence before archive.
```

### No changes to:
- Plugin code
- ADV tools
- Harden 6-scanner framework
- Review remediation flow