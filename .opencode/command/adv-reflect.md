---
name: adv-reflect
description: "Produce a structured two-plane reflection report for an archived change"
phaseGoal: "Synthesize post-completion learnings into a durable reflection artifact for process improvement."
---

<!-- manifest: adv-reflect · gate: none · requiresChangeId: true · prereqs: [adv-archive] · scope: reads[change, tasks, wisdom, local-metrics] · modifies[reflections.jsonl, archive/REFLECTION.md] -->

# ADV Reflect — Two-Plane Reflection Report

Produce two-plane reflection for archived change: project execution + system friction. Reflection is informational and non-blocking from `/adv-archive`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-reflect")` → two-plane dimensions, friction taxonomy, metric synthesis, REFLECTION.md template, persistence rules. If unavailable, use fallback below.

Fallback: load archived change, gather local task/gate metrics, synthesize Plane 1 + Plane 2, call `adv_reflect`, write REFLECTION.md, present summary.

## Exits

| Exit | Condition |
|---|---|
| ✅ Complete | Reflection persisted and REFLECTION.md written |
| ⚠️ Warning | Reflection failed; non-blocking from archive |
| 🎤 Blocked | Change not archived |

## Target Resolution

Parse `$ARGUMENTS`: `change-id` required. If empty, use `adv_change_list` → auto-select single candidate or ask via `question`.

---

## Phase 1: Load Change

1. `adv_change_show changeId: <target>`.
2. Verify status is `"archived"`; if not, emit REFLECTION BLOCKED and stop.
3. Extract title, tasks, wisdom, gates, error_recovery logs, cancellations.

---

## Phase 2: Gather Metrics

Use the loaded change state and `adv_reflect`'s local metric extraction. Capture task count, retry count, elapsed time, per-gate durations, and task-derived work-time metrics without calling a separate user-facing investment tool.

---

## Phase 3: Assemble Plane 1 — Project Execution

Use skill rubric:

| Dimension | Source |
|---|---|
| Efficiency | task counts, elapsed, retry density, per-gate durations |
| Quality | TDD compliance, review/harden findings |
| Process | gate completion, TDD intent mix, delegation count, drift triggers |
| Wisdom | captured/promoted entries, reuse hits |

---

## Phase 4: Assemble Plane 2 — System Friction

Map evidence to categories from skill: `docs_gap`, `missing_capability`, `tool_gap`, `workaround`, `ux_friction`, `provider_specific`.

Use wisdom entries, error recovery logs, cancellations, and runtime-specific failures. Provider-specific only when issue depends on runtime/provider (Bun vs Node, API quirks, env mismatch), not generic logic/design bugs.

---

## Phase 5: Persist

1. Call `adv_reflect changeId: <target>`; report persists to `reflections.jsonl`.
2. Write `{archiveDir}/{date}-{change-id}/REFLECTION.md` using skill template.
3. Content includes change ID/title, Plane 1 metrics, Plane 2 friction table, highlights, improvement suggestions, footer.

---

## Phase 6: Present Report

Emit REFLECTION COMPLETE banner with change ID/title, Plane 1 summary, Plane 2 friction count/top categories, archive path, persisted reflection ID.

### Archive-visible summary

When invoked from `/adv-archive`, return one concise line that the archive terminal report can include:

- `Reflection: completed: {reflection-id}; {friction-count} friction item(s); REFLECTION.md: {path}`
- On failure: Reflection: failed: <reason>; nonblocking — rerun `/adv-reflect <change-id>` later

---

## Error Handling

| Error | Action |
|---|---|
| Change not archived | Block; require `/adv-archive` first |
| `adv_reflect` fails | Warn, emit REFLECTION WARNING, stop; when called from archive, return archive-visible failed summary |
| REFLECTION.md write fails | Warn, emit REFLECTION WARNING, stop; when called from archive, return archive-visible failed summary |

When invoked from `/adv-archive`, reflection failure MUST NOT block archive flow: catch error, emit `[ADV:WARN] Reflection generation failed: {reason}; does not block release`, continue archive, and show rerun `/adv-reflect <change-id>` later in the archive-visible summary.

---

## Command Boundary

| Produces | × MUST NOT |
|---|---|
| Reflection report (JSON + Markdown) | Mutate change state, tasks, or gates |
| Friction analysis | Create tasks or changes |
| Improvement suggestions | Block archive flow when called from it |

- Only `/adv-archive` may trigger `/adv-reflect` as optional post-step.
- `/adv-reflect` does NOT complete gates.
- Reflection is idempotent: rerun overwrites `reflections.jsonl` entry and REFLECTION.md.

## Key Tools

| Purpose | Tool |
|---|---|
| Load change | `adv_change_show` |
| Persist | `adv_reflect` |
| Wisdom | `adv_wisdom_list` |
