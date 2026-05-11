---
name: adv-reflect
description: "Two-plane post-change reflection methodology for archived ADV changes"
keywords:
  [
    "adv",
    "reflect",
    "reflection",
    "postmortem",
    "wisdom",
    "friction",
    "process",
  ]
metadata:
  priority: medium
  source: adv-reflect-command
---

# ADV Reflect Skill

## Purpose

Methodology for post-archive reflection. Produce durable learning without changing gates, tasks, or active change state. Command owns tool calls and archive writes; skill owns analysis rubric and templates.

## Two-Plane Model

### Plane 1 — Project Execution

Assess how change work ran.

| Dimension | Evidence | Questions |
|---|---|---|
| Efficiency | task count, elapsed time, retry density, per-gate duration | Was work sized and sequenced well? Where did time burn? |
| Quality | TDD compliance, review findings, harden findings, verification failures | Did checks catch real issues? Did quality improve before archive? |
| Process | gate completion, TDD intent distribution, delegation count, drift triggers | Did workflow fit scope? Any avoidable loops? |
| Wisdom | entries captured/promoted, reuse hits | What should future changes reuse? |

### Plane 2 — System Friction

Assess ADV/OpenCode/tooling friction that slowed or distorted work.

| Category | Meaning |
|---|---|
| `docs_gap` | Existing docs failed to prevent confusion |
| `missing_capability` | Repeated manual pattern suggests tool/abstraction gap |
| `tool_gap` | Tool failed, was too weak, or required awkward handling |
| `workaround` | Manual workaround succeeded but should not be normal path |
| `ux_friction` | Workflow/approval/interaction caused abandonment or confusion |
| `provider_specific` | Runtime/provider mismatch, e.g. Bun vs Node or model API quirk |

## Evidence Sources

Load from archived change:

- Change title, proposal/agreement/design summaries
- Tasks, statuses, TDD intent, verification notes
- Wisdom entries and promotions
- Gate timestamps and completion evidence
- Error recovery logs, retry counts, doom-loop markers
- Cancellation records and reasons
- Investment report metrics

## Friction Mapping

### Wisdom Entries

| Wisdom Type | Friction Category | Rationale |
|---|---|---|
| `gotcha` | `docs_gap` | Documentation did not prevent surprise |
| `pattern` | `missing_capability` | Recurring manual pattern suggests missing tool/abstraction |
| `failure` | `tool_gap` | Known failure mode indicates tool limitation |
| `convention` | `workaround` | Manual convention signals automation gap |

### Error Recovery Logs

| Signal | Friction Category | Rationale |
|---|---|---|
| Retries > 0 with failed final attempt | `tool_gap` | Tool/strategy did not succeed |
| Retries > 0 with successful final attempt | `workaround` | Alternative path solved it |
| Same error class across tasks | `missing_capability` | Systemic gap |

### Cancelled Tasks

Any cancellation with reason may indicate `ux_friction`, especially if reason cites confusing workflow, approval mismatch, or abandoned path.

### Provider-Specific Friction

Capture `provider_specific` only when issue depends on runtime/provider:

- Bun vs Node behavior differences
- Provider-specific API quirks or limits
- Runtime environment inconsistency

Do NOT use provider-specific for generic logic errors, missing tests, or design mistakes.

## Metric Synthesis

Recommended derived values:

- `retry_density = retry_total / max(done_tasks, 1)`
- `tdd_compliance = tasks_with_required_tdd_evidence / tasks_requiring_tdd`
- `completed_gates = count(done gates)`
- `delegation_count = tasks with delegation evidence`
- `drift_triggers = review/harden drift pauses`
- `investment_tier = small | medium | large` based on elapsed time + task count from investment report

Label missing metrics as `unknown`; do not fabricate.

## REFLECTION.md Template

```markdown
## Reflection

### Change
{change-id} — {title}

### Plane 1: Project Execution

**Efficiency**
- Tasks: {done}/{total} done, {cancelled} cancelled
- Retries: {retry_total} total (density: {retry_density})
- Elapsed: {elapsed_minutes} min
- Investment tier: {tier}

**Quality**
- TDD compliance: {tdd_compliance}%
- Review findings: {review_findings_count}
- Harden findings: {harden_findings_count}

**Process**
- Gates completed: {completed_gates}/{total_gates}
- Delegation used: {delegation_count} tasks
- Drift triggers: {drift_triggers}

**Wisdom**
- Entries captured: {entries_captured}
- Promoted to project: {entries_promoted}

### Plane 2: System Friction

| Category | Description | Workaround |
|---|---|---|
| {category} | {description} | {workaround} |

### Highlights
- {highlight 1}
- {highlight 2}

### Improvement Suggestions
- {suggestion 1}
- {suggestion 2}

---

> **{change-id}** · reflection persisted · {timestamp}
```

## Persistence Contract

- `adv_reflect` persists structured two-plane report to `reflections.jsonl`.
- Command writes human-readable `REFLECTION.md` inside archive bundle.
- Re-running is idempotent: latest reflection replaces prior report for same change.
- Reflection failure from `/adv-archive` is warning-only and MUST NOT block archive completion.

## Output Summary

REFLECTION COMPLETE includes:

- Change ID and title
- Plane 1 one-line metric summary
- Plane 2 friction count and top categories
- Archive location of REFLECTION.md
- Persisted reflection ID

## Constraints

- Read-only methodology only.
- No gate completion.
- No task/change creation.
- No archive blocking when invoked from `/adv-archive`.
- Do not invent metrics; mark missing values `unknown`.
