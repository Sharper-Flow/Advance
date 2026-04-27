---
name: adv-reflect
description: "Produce a structured two-plane reflection report for an archived change"
phaseGoal: "Synthesize post-completion learnings into a durable reflection artifact for process improvement."
---

<!-- manifest: adv-reflect · gate: none · requiresChangeId: true · prereqs: [adv-archive] · scope: reads[change, tasks, wisdom, investment] · modifies[reflections.jsonl, archive/REFLECTION.md] -->

# ADV Reflect — Two-Plane Reflection Report

Produce a structured two-plane reflection report for an archived change.

- **Plane 1** — Project execution: efficiency, quality, process, wisdom.
- **Plane 2** — System friction: tool gaps, workarounds, missing capabilities, UX friction.

## Exits

| Exit        | Condition                                      |
| ----------- | ---------------------------------------------- |
| ✅ Complete | Reflection persisted and REFLECTION.md written |
| ⚠️ Warning  | Reflection failed (non-blocking from archive)  |
| 🎤 Blocked  | Change not archived                            |

<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution

Parse `$ARGUMENTS`: `change-id` (required).

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select or `question` tool

---

## Phase 1: Load Change

1. `adv_change_show changeId: <target>` → verify status is `"archived"`
2. If not archived → emit REFLECTION BLOCKED banner → stop
3. Extract: title, tasks, wisdom entries, gates, error_recovery logs, cancellation records

---

## Phase 2: Gather Metrics

Call `adv_investment_report changeId: <target>` → capture:
- Task count, retry count, elapsed time
- Threshold tier (`auto` | `escalate` | `hardstop`)

This feeds Plane 1 efficiency metrics.

---

## Phase 3: Assemble Plane 1 — Project Execution

Synthesize from change data:

| Dimension  | Source Data                                              |
|------------|----------------------------------------------------------|
| Efficiency | Task counts, elapsed time, retry density, per-gate durations, investment tier |
| Quality    | TDD compliance rate, review/harden findings counts       |
| Process    | Gate completion rate, TDD intent distribution, delegation count, drift triggers |
| Wisdom     | Entries captured, entries promoted, reuse hits           |

---

## Phase 4: Assemble Plane 2 — System Friction

### Friction-Capture Protocol

Analyze the following sources and map to friction categories:

**1. Wisdom Entries**
| Wisdom Type | Friction Category | Rationale |
|-------------|-------------------|-----------|
| `gotcha`    | `docs_gap`        | Documentation did not prevent the surprise |
| `pattern`   | `missing_capability` | A recurring pattern suggests a missing abstraction or tool |
| `failure`   | `tool_gap`        | A known failure mode indicates tool limitation |
| `convention`| `workaround`      | Manual convention enforcement signals automation gap |

**2. Error Recovery Logs**
| Signal      | Friction Category | Rationale |
|-------------|-------------------|-----------|
| Retries > 0 with failed final attempt | `tool_gap` | Tool did not succeed after repeated attempts |
| Retries > 0 with successful final attempt | `workaround` | A workaround eventually succeeded |
| Repeated same error class across tasks | `missing_capability` | Systemic gap, not task-specific |

**3. Cancelled Tasks**
| Signal      | Friction Category | Rationale |
|-------------|-------------------|-----------|
| Any cancellation with reason | `ux_friction` | Workflow or UX issue caused abandonment |

**4. Provider-Specific Friction**
Capture `provider_specific` friction ONLY when the issue is runtime-dependent:
- Bun vs Node behavior differences
- Provider-specific API quirks or limitations
- Runtime environment inconsistencies

Do NOT capture provider-specific friction for logic errors or design issues that would reproduce on any runtime.

---

## Phase 5: Persist

### Step 5a: Call `adv_reflect`

```
adv_reflect changeId: <target>
```

This persists the two-plane report to `reflections.jsonl`.

### Step 5b: Write REFLECTION.md

Write a human-readable reflection report to the archive directory:

```
{archiveDir}/{date}-{change-id}/REFLECTION.md
```

Content includes:
- Change ID and title
- Plane 1 summary (efficiency, quality, process, wisdom)
- Plane 2 friction items with categories
- Highlights
- Improvement suggestions

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
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
|----------|-------------|------------|
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

---

## Phase 6: Present Report

Emit REFLECTION COMPLETE banner with:
- Change ID and title
- Plane 1 key metrics (one-line summary)
- Plane 2 friction count and top categories
- Archive location of REFLECTION.md
- Persisted reflection ID from `adv_reflect`

---

## Error Handling

| Error                    | Action                                              |
|--------------------------|-----------------------------------------------------|
| Change not archived      | Block — require `/adv-archive` first               |
| `adv_reflect` fails      | Log warning, emit REFLECTION WARNING banner, stop  |
| REFLECTION.md write fails| Log warning, emit REFLECTION WARNING banner, stop  |

### Non-Blocking from `/adv-archive`

When this command is invoked from `/adv-archive` (e.g., as a post-archive step), reflection failure MUST NOT block the archive flow:

1. Catch any reflection error
2. Emit `[ADV:WARN] Reflection generation failed: {reason}`
3. Continue with archive completion
4. User can re-run `/adv-reflect <change-id>` independently later

---

## Command Boundary

| Produces                           | × MUST NOT                              |
| ---------------------------------- | --------------------------------------- |
| Reflection report (JSON + Markdown)| Mutate change state, tasks, or gates    |
| Friction analysis                  | Create new tasks or changes             |
| Improvement suggestions            | Block archive flow when called from it  |

- Only `/adv-archive` may trigger `/adv-reflect` as an optional post-step
- `/adv-reflect` does NOT complete any gate
- Reflection is idempotent: re-running overwrites `reflections.jsonl` entry and REFLECTION.md

---

## Key Tools

| Purpose       | Tool                                    |
| ------------- | --------------------------------------- |
| Load change   | `adv_change_show`                       |
| Investment    | `adv_investment_report`                 |
| Persist       | `adv_reflect`                           |
| Wisdom        | `adv_wisdom_list`                       |
