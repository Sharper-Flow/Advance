## Design

Amended after independent validation (verdict CONCERNS, blockers B1-B3, all resolved below).

### The invariant being restored

A summary shard is a projection derived from a canonical change record. It must not be treated as evidence that the change is active. Authority belongs to the canonical record; the shard is a cache of its fields.

Both current readers invert this. They enumerate shards, trust the shard's self-reported `status`, and never ask whether the canonical record still exists, still parses, or has since gone terminal.

### Two sites, one cause

| Site | File | Consumer |
|---|---|---|
| `loadSummariesFromDisk` | `bin/lib/live-status.ts:157-207` | `adv status --json`, dashboard |
| `buildLauncherProjection` | `plugin/src/storage/launcher-projection.ts:92` | `active-launcher-state.json` |

Both must change. The launcher reads `active-launcher-state.json` whenever its live probe fails, so fixing only the CLI leaves the ghost path open through the fallback.

### D1 — Validate only post-filter survivors

`change-summary-shard.test.ts:638-641` documents shard-only reading as deliberate: status should not hydrate every canonical record. Validating all shards would reverse that benefit — the affected store holds 117 shards, several canonical records exceeding 150 KB.

It is unnecessary. The shard-status filter (`live-status.ts:170`) drops archived and closed shards *before* emit, leaving roughly 10 candidates. Validation applied after that filter costs about 10 loads per call.

Validation confirmed the cost is marginal in context: `countTerminalChanges` already reads and JSON-parses every archive record on every `adv status` invocation (`bin/adv:137`, `bin/lib/changes.ts:59`). Ten additional bounded loads sit on top of an existing unbounded archive scan.

Ordering is load-bearing: filter by shard status first, validate canonical second, emit third.

### D2 — Four-way classification (amended, blocker B3)

The original three-way split missed a case the validator traced. If a change is validly terminal in canonical but its shard still says `draft`, every existing and proposed filter passes it: the line-170 filter reads the *shard* status, and `countTerminalChanges` only scans `archive/`, so an archived-in-place record ("zombie shadow", `plugin/src/storage/json.ts:506-509`) is not found there. That row would survive the fix.

Since the canonical record is already parsed, checking its status costs nothing.

| Canonical state | Disposition | Reason code |
|---|---|---|
| loads, status non-terminal | emit as active | — |
| loads, status `archived` or `closed` | drop, report | `canonical_terminal` |
| `{success: true, data: null}` | drop, report | `canonical_missing` |
| `{success: false, type}` | drop, report | `canonical_error` + type |

A boolean existence check is insufficient. Measured against the affected store, existence alone catches 3 of the 4 known ghosts; `addProviderToolSearch` has a 159693-byte canonical record that fails `ChangeSchema` because one `subagent_reports[].architecture_assessment` exceeds `RESEARCHER_FIELD_MAX = 12_000` (`types/subagent-reports.ts:50`, enforced at 60-85). One oversized subfield rejects the whole document; this class has wedged archives before (`subagent-reports.archive-through.test.ts:1-9`).

Do not write `=== "archive"` or `=== "cancel"`: those exact tokens are forbidden in `bin/adv` and `live-status.ts` (`cli-bridge-contract.test.ts:262-263`). The statuses are `archived` and `closed`.

### D3 — Report, never silently drop

Dropping a row without saying so converts visible-but-wrong into invisible-and-wrong. `addProviderToolSearch` is a real change whose record is corrupt; silently discarding it destroys the only signal that it needs repair.

Excluded shards attach to `LiveStatusPayload` (`plugin/src/shared/cli-projection.ts:98-118`) as a distinct optional field carrying `{id, reason}` per exclusion, separate from the active-change list. Validation confirmed the payload is a plain TS interface with an established optional-field precedent (`resume_projection_state`, lines 110-115) and no strict schema gate in `cli-bridge-contract.test.ts`.

`bin/adv runStatus` emits a fixed payload with no view selector, so the plugin-side hygiene view is unreachable from the CLI. A payload field is the only surface reaching both.

### D4 — Dist-bundle classifier (amended, blocker B1)

**The original placement was wrong.** `cli-source-boundary.test.ts:110-130` walks `projection-boundary.ts`'s *transitive* relative-import graph and asserts no visited file lies under `plugin/src/storage/`. Re-exporting a storage classifier through it pulls storage into that walk and fails the test. The boundary's docblock promises a pure graph (`plugin/src/cli/projection-boundary.ts:6-7`).

Use the established standalone-bundle pattern instead. `bin/adv:83-101` and `104-122` already load `plugin/dist/reconcile-cli.js` and `plugin/dist/doctor-cli.js` by dynamic import with an env override, never plugin source. The classifier ships the same way.

This keeps a single Zod authority. The rejected alternative — a CLI-local check in `bin/lib/` — would re-implement lane bounds outside `ChangeSchema` and diverge on exactly the `schema_error` case D2 exists to catch. That is a duplicate validation path, and it would drift.

**Degradation.** `runReconcile` and `runDoctor` return exit 2 when their bundle is absent. Status is the hot read path and must not hard-fail. If the classifier bundle is unavailable, emit rows unvalidated and set an explicit `validation_unavailable` marker on the residue field. There is deliberately no fallback validator: a second implementation is what this design exists to avoid, so the degraded mode reports that it could not check rather than checking differently.

Shape:

```
classifySummaryCandidates(changesDir, candidateIds) -> {
  valid:    string[]
  excluded: Array<{ id: string; reason: "canonical_missing" | "canonical_terminal" | "canonical_error"; detail?: string }>
}
```

### D5 — Compose at the caller, do not modify `listSummaryChanges` (amended, blocker B2)

`listSummaryChanges` documents its contract as listing "without hydrating full change projections" (`change-summary-shard.ts:654-656`) — the exact perf property D1 leans on. `change-summary-shard.test.ts:641-709` seeds shards with no canonical files and asserts rows are returned; in-place validation would break that test and reverse the documented contract.

Its only non-test consumer is `buildLauncherProjection` (`launcher-projection.ts:92`). Classification composes there, leaving `listSummaryChanges` a pure shard lister.

### Incidental coverage

`countTerminalChanges` resolves `join(root, "archive")` (`bin/adv:136`), but stores may use an in-repo `.adv/archive` layout (`plugin/src/storage/json.ts:146`). For those stores the CLI's terminal reconciliation reads the wrong directory. The classifier is unaffected because it reads canonical status directly and never consults archive location, so it covers this class too. Not separate scope; recorded so the coverage is not mistaken for luck.

### Scope boundary

In scope: read-time validation at both sites, the dist-bundle classifier, the residue field, tests.

Named follow-ups, deliberately excluded — and load-bearing for hygiene, not polish:

- **Write-time shard retraction.** `executeQuarantine` (`tools/change-projection-quarantine.ts:353-365`) and `adv_archive_purge` (`handlers-archive.ts:1188-1273`) remove canonical records without retracting the shard. Archive never touches `summaries/` at all. Read-time validation makes the orphans harmless but does not stop them being created.
- **Reconcile operator surface.** `ResidueClassSchema` (`storage/store-residue-scan.ts:34-47`) has no orphan-shard class and the residue scan iterates the changes dir (`store-residue-scan.ts:270-294`), so it structurally cannot see orphan shards. GC never removes whole `summaries/<id>` directories (`change-summary-shard.ts:754-779`), so disk grows unbounded. Read-time validation hides that growth; it does not bound it.

Neither is required for correct output, which is what this change owns.

### Structural guards to respect

- `dead-worker-query-paths.test.ts:49-50` and `cli-bridge-contract.test.ts:245-247` pin the `loadSummariesFromDisk` name — extend it, do not rename it.
- `cli-source-boundary.test.ts:110-130` — no new `plugin/src/storage/` reachability from the CLI boundary module.
- `no-psw-references.test.ts:141-142` forbids orphan-sweep tool names — this change adds no tool.

### Acceptance criteria

- **AC1** `loadSummariesFromDisk` excludes any surviving shard whose canonical record is absent, unloadable, or terminal, and emits only validated rows.
- **AC2** `buildLauncherProjection` applies the same exclusion, so `active-launcher-state.json` carries no orphan entries.
- **AC3** Every exclusion is reported with id and reason on the payload; no exclusion is silent.
- **AC4** Canonical validation runs only on shards surviving the terminal-status filter; a store of N shards with K non-terminal performs K canonical loads, not N.
- **AC5** One classifier implementation serves both call sites, shipped as a dist bundle; no second validator exists anywhere.
- **AC6** `bin/lib/` imports no `plugin/src/storage/` module and `cli-source-boundary.test.ts` passes unchanged.
- **AC7** `listSummaryChanges` keeps its no-hydration contract and `change-summary-shard.test.ts:641-709` passes unchanged.
- **AC8** A shard whose canonical is validly terminal but whose shard status is non-terminal is excluded as `canonical_terminal`.
- **AC9** When the classifier bundle is unavailable, status emits rows with an explicit `validation_unavailable` marker rather than failing or silently trusting shards.
- **AC10** Measured against the affected toolbox store: `adv status --json` reports 6 active changes, with `noteConcordStageInventory`, `diagnoseTailnetLag`, `addAdvResumeShortcut` reported `canonical_missing` and `addProviderToolSearch` reported `canonical_error`.
- **AC11** The 6 genuinely-active changes are unaffected, all having valid canonical records.

### Constraints

- **C1** Do not rename `loadSummariesFromDisk` or `loadLiveSummaries`.
- **C2** Do not add validation before the terminal-status filter.
- **C3** Do not import `plugin/src/storage/` from `bin/lib/`, directly or transitively through the CLI boundary module.
- **C4** Do not modify `listSummaryChanges` in place.
- **C5** Do not weaken or delete existing structural guard tests.
- **C6** Do not repair store contents as part of this change; output correctness only.
- **C7** Do not introduce a second canonical-validation implementation as a degradation fallback.
