# Research Pack: Repo Improve (broad polish scan)

- Target: broad repo-wide improvement scan (focus: polish opportunities)
- Mode: broad
- Created: 2026-05-04
- Updated: 2026-05-04

## Purpose & Scope

Captures a polish-flavored improvement scan across the ADV plugin repo at `Sharper-Flow/Advance`. Focus is on code-quality, DX, observability, and reliability friction that surfaced during a multi-change session. Does NOT cover: full security audit, performance benchmarking, or architectural redesign — those would route through `/adv-discover` against a specific proposal. External landscape analysis is unavailable for this run (Kagi connection error); the section is preserved as-is for future refresh.

## Current State

### Security
- **SEC1 (LOW):** Only 2 `as any` casts in source (`tool-registry.ts:66`, `safe-execute.ts`); both documented.
- **SEC2 (LOW):** Bash guard `eslint-disable-next-line no-control-regex` calls explicitly rationalised at `worktree/index.ts:156` and `utils/shell.ts:14`.
- **SEC3 (LOW):** Zero external HTTP calls in source (`grep -rn "fetch(" src/` → 0).
- **SEC4 (GREENFIELD):** No formal `docs/threat-model.md`; acceptable for plugin scope.

### Reliability
- **REL1 (MEDIUM):** 76 `throw new Error(...)` in source; codebase ships an `errorClass` taxonomy (TRANSIENT/SEMANTIC/ENVIRONMENTAL/FATAL) for `adv_task_update` and similar but the throw sites bypass it. Inconsistent recovery semantics.
- **REL2 (LOW):** Strong lock + heartbeat pattern in `src/temporal/` (123 lock-related lines).
- **REL3 (LOW):** Worker restart respawn loop with bounded retries — verified during today's session (post-`adv_temporal_worker_restart`).
- **REL4 (LOW):** 22 test `.skip*` markers; 19 are `describe.skipIf(!isLinux)` (legit cross-platform gating). No quarantined tests.

### Testing
- **TST1 (LOW):** Test:source LoC ratio ≈ 1.3:1 (63K test / 48K src). Healthy.
- **TST2 (LOW):** Asset-style tests (`*-assets.test.ts`) verify command/manifest consistency; ~9 such files.
- **TST3 (LOW):** Integration tests opt-in via `RUN_INTEGRATION_TESTS=1` + `.itest.ts` suffix.
- **TST4 (MEDIUM):** `change.ts` (2096 lines, 11 tools) tested by single `change.test.ts` (146 tests). Per-tool test files would scale better.

### Observability
- **OBS1 (LOW):** 80 `logger.*` calls via canonical `createLogger` (`utils/debug-log.ts`). Well-established.
- **OBS2 (MEDIUM):** 6 raw `console.warn`/`console.error` calls in source bypass the logger:
  - `checkpoint.ts:261, 497, 645, 678`
  - `adv-worktree.ts:33, 36`
  - `temporal/worker.ts:342`
  Logger writes to file sink under `ADV_DEBUG=1`; these console calls don't.
- **OBS3 (LOW):** Reflection captured per change.
- **OBS4 (LOW):** Status markers consistently emitted via `events/terminal.ts`.

### Developer Experience
- **DX1 (MEDIUM):** `pnpm run check` legitimately ~50s. Newly-shipped `adv_run_test timeoutMs` solves agent-tool friction; humans still wait.
- **DX2 (MEDIUM):** Source-vs-dist gotcha documented (just-added AGENTS.md subsection). Still requires session restart for end-to-end behavior validation; no `dev:watch` workflow that auto-rebuilds + signals OpenCode.
- **DX3 (LOW):** `tdd_intent` default-to-`inline` documented (just-added ADV_INSTRUCTIONS.md bullet).
- **DX4 (LOW):** 4 eslint-disable lines, all with explicit rationales.
- **DX5 (GREENFIELD):** No `CONTRIBUTING.md`; README + AGENTS.md cover it, but explicit contributor guide would help external PRs.

### Code Quality
- **CQ1 (HIGH):** `plugin/src/types.ts` is 1852 lines with 135 top-level exports — monolithic shared types file. Hurts discovery + review surface.
- **CQ2 (HIGH):** `plugin/src/tools/change.ts` is 2096 lines containing 11 tool definitions in one object literal. Per-tool files would localize blast radius.
- **CQ3 (MEDIUM):** Legacy `db_dir: z.string().default(".adv/db")` still in `types.ts:1351` defaults despite Temporal-only migration having shipped. Default perpetuates the legacy.
- **CQ4 (MEDIUM):** `worktree/index.ts` is 1613 lines with 6 top-level exports (create + delete + list + inventory + reap). Worth splitting by op.
- **CQ5 (LOW):** 46 `} catch (error` handlers; mostly fine, a few use raw `console.warn` (see OBS2).

## LBP / Reference Comparison

**Context7:** not applicable for this internal-plugin polish scan; LBP comparison uses repo-internal conventions (`AGENTS.md`, project.md).

| Area | State | Note |
|---|---|---|
| Tool registration pattern | SOUND | `bindTool` / `registerTool` in `tool-registry.ts`. |
| Schema source of truth | SOUND | Zod in `types.ts` authoritative. |
| ADV state location | SOUND | External `~/.local/share/.../advance/{project-id}/`. |
| Worker lock | SOUND | Per-project flock with PID heartbeat + restart loop. |
| Spec lifecycle | SOUND | 7-gate model with machine-enforced planning gate. |
| File organization | DRIFTED | Mega-files (CQ1, CQ2, CQ4) violate locality-of-behavior (rules.yaml P04). |
| Error contract | DRIFTED | `errorClass` taxonomy bypassed by 76 raw `throw new Error` (REL1). |
| Legacy config defaults | DRIFTED | `db_dir` default still present despite Temporal-only migration (CQ3). |
| Logger pattern | DRIFTED | 6 raw `console.*` calls in source bypass `createLogger` (OBS2). |

### Corrections (HIGH-tier)

- **CQ1 — Split `types.ts`:** target `types/{changes,tasks,specs,gates,worktree,conformance,...}.ts` + `types/index.ts` barrel. Mechanical refactor, large diff, low semantic risk. Likely shippable as a single change.
- **CQ2 — Split `change.ts`:** target `tools/change/{list,show,create,update,close,bulk-close,validate,archive,update-issues,reenter}.ts` + barrel re-exporting `changeTools`. Same pattern applicable to `worktree/index.ts` (CQ4).

### Greenfield perspective

If rebuilding from scratch on Bun + Temporal + Zod v4 today:
- Same shape: tool registry, external state, Temporal-only, 7-gate model.
- One file per tool family from day one (not 11 tools per file).
- `errorClass` enforced at the throw site via a `throwAdvError(class, message)` helper, not optional metadata.
- Logger-only convention, no raw console in source.

## Competitors & Alternatives

⚠ not refreshed (Kagi unavailable). Conservative observation without external data: ADV is its own category (spec-driven dev orchestrator embedded in OpenCode). Closest known comparators:
- BMAD (referenced in CHANGELOG and an archived change `adoptBmadInspiredWorkflowEngin`)
- OpenSpec (referenced as inspiration in `scripts/migrate-openspec.ts`)
- Generic workflow tools (Linear, Shortcut, Jira) — different category, no real overlap

Future refresh should run Kagi queries: `spec-driven development workflow tools 2026`, `OpenCode plugin best practices Bun TypeScript 2026`.

## Emerging Patterns

⚠ not refreshed (Kagi unavailable). Future refresh would investigate:
- Spec conformance trends (the repo already has `_conformance/` infrastructure)
- AI-agent governance frameworks (cost-governance, doom-loop detection — both already implemented)

## Applicability to This Repo

| Item | Applies? | Path |
|---|---|---|
| File-split refactor (CQ1/CQ2/CQ4) | YES — high value | `plugin/src/types.ts`, `plugin/src/tools/change.ts`, `plugin/src/tools/worktree/index.ts` |
| `errorClass` adoption (REL1) | YES — wide touch but mechanical | All source `throw new Error` sites (76) |
| Console → logger consistency (OBS2) | YES — 6 sites | `checkpoint.ts:261/497/645/678`, `adv-worktree.ts:33/36`, `temporal/worker.ts:342` |
| `db_dir` default removal (CQ3) | YES — legacy debt | `plugin/src/types.ts:1351`, `plugin/src/storage/store-disk.ts:136` |
| `dev:watch` auto-rebuild workflow (DX2) | MAYBE — investigate trade-offs vs explicit rebuild | `plugin/package.json` scripts; OpenCode plugin host integration |
| `CONTRIBUTING.md` (DX5) | OPTIONAL — nice-to-have | repo root |
| Threat model doc (SEC4) | NO — out of scope for plugin | n/a |
| Per-tool unit tests (TST4) | NATURAL FOLLOW-ON to CQ2 split | `plugin/src/tools/change/*.test.ts` after split |

## Open Questions for Research

1. **Refactor sequencing for `types.ts`** — split first by namespace (existing usage patterns) or by capability (matches `.adv/specs/` shape)? The latter aligns better with the gate model but requires more relocation.
2. **`change.ts` split path** — preserve the `changeTools` barrel name or rename to per-tool exports? Existing imports `import { changeTools } from "./change"` constrain the answer.
3. **`errorClass` enforcement style** — runtime helper (`throwAdvError`) vs ESLint custom rule that flags `throw new Error` outside specific allowlist? The latter is more enforceable; the former is simpler.
4. **`db_dir` deprecation policy** — remove default and mark deprecated, or keep default but warn at runtime when set? AGENTS.md already says "legacy-only and should appear only in compatibility docs or dry-run hygiene reports."
5. **`dev:watch` integration** — does OpenCode currently support hot-reload of plugin `dist/`? If not, a `tsup --watch` script is incomplete without OpenCode-side support; may be an OpenCode RFC instead of an ADV change.
6. **Test split for `change.ts`** — keep one mega-test for cross-tool interactions and add per-tool tests, or split entirely?

## Sources

- `plugin/src/types.ts` (1852 lines, 135 exports)
- `plugin/src/tools/change.ts` (2096 lines, 11 tools)
- `plugin/src/tools/worktree/index.ts` (1613 lines, 6 exports)
- `plugin/src/utils/debug-log.ts` (canonical `createLogger`)
- `plugin/src/tool-registry.ts:66` (Zod cast rationale)
- `AGENTS.md` Source-vs-Dist Reload Gotcha (just-added)
- `ADV_INSTRUCTIONS.md` ADV MCP Tool Invocation (just-added bullets for tdd_intent, worktreePath, timeoutMs)
- `.opencode/instructions/rules.yaml` P04 (locality-of-behavior), P19 (simplicity), P29 (clean-not-minimal)
- `package.json` `check` script (typecheck + isolation + lint + format chain)
- Kagi external landscape: ⚠ not refreshed (RemoteDisconnected during scan)
