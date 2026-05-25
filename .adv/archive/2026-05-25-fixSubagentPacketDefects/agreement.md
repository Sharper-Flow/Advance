# Agreement

## Objectives

- O1: Stop typed ADV sub-agents from asking the user for orchestrator-owned packet fields.
- O2: Make top-level ADV delegation policy require typed worker packet identity fields.
- O3: Preserve strict report ingest and worker-packet schema alignment.

## Acceptance Criteria

- AC1: Top-level ADV instructions state typed worker spawns must include `WORKING DIRECTORY`, `CHANGE`, `TASK`, and `ATTEMPT`; `adv-reviewer` typed workers must also include `PHASE`.
- AC2: Top-level ADV instructions state missing typed-worker packet identity fields are orchestrator defects handled internally by corrected retry or inline fallback, never by user `question`.
- AC3: `adv-reviewer` and `adv-engineer` prompts do not instruct leaf workers to ask the user/orchestrator via `question` for missing `TASK`, `PHASE`, `ATTEMPT`, or `WORKING DIRECTORY`; they return structured packet-defect failure for orchestrator recovery.
- AC4: Asset tests fail if user-facing `question` wording returns for missing packet identity fields.
- AC5: Focused asset tests and `pnpm run check` pass.

## Constraints

- C1: Do not weaken `adv_subagent_report_submit` schemas.
- C2: Do not add persisted report support for `adv-researcher` or `adv-tron`.
- C3: Do not redesign delegation routing.

## Avoidances

- DONT1: Do not make users provide `TASK`, `PHASE`, `ATTEMPT`, `sessionID`, or other packet identity values.
- DONT2: Do not rely on prose-only guidance without tests.

## Sign-Off

User reported repeated repro and requested current ADV settings inspection.