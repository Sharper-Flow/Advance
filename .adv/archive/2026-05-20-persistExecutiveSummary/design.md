# Design: Persist Executive Summary

## Architecture

Extend the existing 4-artifact pattern to a 5th slot: `executive-summary.md`. The extension is purely additive — no existing artifact paths change.

### Data flow

```
/adv-review Phase 7 (acceptance sign-off)
  └─ User replies `accept`
      └─ Orchestrator composes executive summary (hybrid: programmatic ingredients + agent narrative)
          └─ adv_change_update(executiveSummary: "...") → writes executive-summary.md
              └─ Signal: updateArtifactMetadataSignal({ kind: "executiveSummary", metadata })
  └─ adv_gate_complete(acceptance) — AFTER persist

/adv-archive (sign-off)
  └─ adv_change_show(include: { executiveSummary: true }) → reads _executiveSummary
      └─ Sign-Off Boundary template includes `### Executive Summary` sourced from artifact
  └─ createArchive() copies all files from change dir → executive-summary.md flows in for free
```

## Implementation Strategy

### 1. Type extensions (contracts.ts, activities.ts)

**`plugin/src/temporal/contracts.ts`** line 102-106:
```typescript
export type ArtifactKind =
  | "proposal"
  | "problemStatement"
  | "agreement"
  | "design"
  | "executiveSummary";  // ADD
```

**`plugin/src/temporal/contracts.ts`** line 173-179 (`ChangeWorkflowState.artifacts`):
```typescript
artifacts: {
  proposal?: ArtifactMetadata;
  problemStatement?: ArtifactMetadata;
  discovery?: ArtifactMetadata;
  design?: ArtifactMetadata;
  agreement?: ArtifactMetadata;
  executiveSummary?: ArtifactMetadata;  // ADD
};
```

**`plugin/src/temporal/activities.ts`** line 41-52:
```typescript
export type ArtifactKind =
  | "proposal"
  | "problem-statement"
  | "agreement"
  | "design"
  | "executive-summary";  // ADD (uses filename convention)

const ARTIFACT_FILENAME: Record<ArtifactKind, string> = {
  proposal: "proposal.md",
  "problem-statement": "problem-statement.md",
  agreement: "agreement.md",
  design: "design.md",
  "executive-summary": "executive-summary.md",  // ADD
};
```

Note: `activities.ts` uses kebab-case (`"problem-statement"`) while `contracts.ts` uses camelCase (`"problemStatement"`). This dual convention is intentional — `activities.ts` maps to filenames, `contracts.ts` is workflow state keys. The signal handler in `store-temporal/changes.ts` (line 484-494) maps between them. We follow this pattern: `"executive-summary"` in activities, `"executiveSummary"` in contracts/workflow-state.

### 2. Storage layer

**`plugin/src/storage/json.ts`** — `updateChangeArtifacts()` (line 679):
- Add 5th parameter: `executiveSummaryContent?: string`
- Add entry to artifacts array: `{ key: "executiveSummaryPath", content: executiveSummaryContent, filename: "executive-summary.md" }`
- Add `executiveSummaryPath` to result type

**`plugin/src/storage/json.ts`** — `createChangeScaffold()` (line 568):
- Add 5th parameter: `executiveSummaryContent?: string`
- Write `executive-summary.md` if content provided
- Add `executiveSummaryPath` to return type
- Note: scaffold is called at creation time; executive summary is typically written at acceptance, so this parameter will usually be undefined. Include for symmetry.

**`plugin/src/storage/store-types.ts`** (line 86-115):
- Add `executiveSummaryContent?: string` to `create` params (line 92)
- Add `executiveSummaryPath?: string` to `create` return type (line 98)
- Add `executiveSummaryContent?: string` to `updateArtifacts` params (line 107)
- Add `executiveSummaryPath?: string` to `updateArtifacts` return type (line 113)

**`plugin/src/storage/store-disk.ts`** (line 328-427):
- `create`: thread 5th param to `createChangeScaffold`, return `executiveSummaryPath`
- `updateArtifacts`: thread 5th param to `updateChangeArtifacts`, return `executiveSummaryPath`

**`plugin/src/storage/store-temporal/changes.ts`** (line 463-508):
- `updateArtifacts`: add 5th param, thread to legacy store
- In signal mapping array (line 484-494): add `["executiveSummary", result.executiveSummaryPath]`

### 3. Tool surface

**`plugin/src/tools/change.ts`** — `adv_change_update` (line 1881):
- Add `executiveSummary` z.string().optional() to args schema
- Update describe text to include `executiveSummary` in at-least-one-of list
- Add `executiveSummary` to execute params type
- Add to at-least-one guard condition
- Thread to `activeStore.changes.updateArtifacts`
- Add `executiveSummaryPath` to output

**`plugin/src/tools/change.ts`** — `adv_change_create` (line 1522):
- Add `executiveSummary` z.string().optional() to args schema
- Thread to `store.changes.create`
- Add `executiveSummaryPath` to output

**`plugin/src/tools/change.ts`** — `adv_change_show` include (line 1273-1297):
- Add `executiveSummary: z.boolean().optional()` to include schema
- Add `executiveSummary?: boolean` to execute include type
- In execute (after line 1509): add `if (include.executiveSummary)` block reading `join(changeDir, "executive-summary.md")` → `output._executiveSummary`

### 4. Command guidance

**`.opencode/command/adv-review.md`** Phase 7 (line 330-380):
Between "Build Acceptance Summary" and "Ask for Acceptance", add a new sub-section:

```markdown
### Persist Executive Summary

After composing the acceptance summary and before asking for acceptance, persist the executive summary:

1. `adv_investment_report changeId: {id}` → gather programmatic metrics
2. Compose executive summary using the acceptance summary content:
   - **Outcome**: 1–2 sentence narrative verdict
   - **Verdict**: APPROVED / CHANGES_REQUESTED / BLOCKED
   - **What Was Built**: ordered list from tasks (use implementation_summary)
   - **What Was Verified**: review verdict, finding counts, investment tier, contract matrix
   - **Remaining Concerns**: open items or "None"
3. `adv_change_update changeId: {id} executiveSummary: "{composed markdown}"`
```

After the user accepts and before `adv_gate_complete`, verify the artifact was written.

**`.opencode/agents/adv.md`** § Sign-Off Boundary (line 231-252):
Add `### Executive Summary` section to the Change Report template:

```
### Executive Summary
{_executiveSummary content, read via adv_change_show include.executiveSummary}
```

**`.opencode/command/adv-archive.md`** (line 32-76):
In Phase 1 where `adv_change_show` is called, ensure `include: { executiveSummary: true }` is included so the sign-off boundary has the content available.

### 5. Tests

- **`plugin/src/storage/json.test.ts`**: Extend `updateChangeArtifacts` suite with 5th param test. Verify `executive-summary.md` is written and returned.
- **`plugin/src/storage/json.test.ts`**: Extend `createChangeScaffold with agreement and design` suite for `executiveSummaryContent` param.
- **`plugin/src/tools/change.test.ts`** (or equivalent): Test `adv_change_update` round-trip with `executiveSummary` field.
- **`plugin/src/tools/change.test.ts`**: Test `adv_change_show` `include.executiveSummary` reads the file.
- **`plugin/src/sync-global.test.ts`**: No changes needed — "Sign-Off Boundary" marker check still passes since we're adding within the section, not removing it.
- **Asset tests**: `human-checkpoints-assets.test.ts` acceptance checkpoint test should still pass — we're adding a step between build and ask, not changing the ordering of approval vs gate-complete.

### 6. Files changed (summary)

| File | Change |
|---|---|
| `plugin/src/temporal/contracts.ts` | Add `"executiveSummary"` to `ArtifactKind` and `artifacts` |
| `plugin/src/temporal/activities.ts` | Add `"executive-summary"` to `ArtifactKind`, `ARTIFACT_FILENAME` |
| `plugin/src/storage/json.ts` | 5th param on `updateChangeArtifacts`, `createChangeScaffold` |
| `plugin/src/storage/store-types.ts` | 5th param on `create`, `updateArtifacts` signatures |
| `plugin/src/storage/store-disk.ts` | Thread 5th param on `create`, `updateArtifacts` |
| `plugin/src/storage/store-temporal/changes.ts` | 5th param + signal mapping entry |
| `plugin/src/tools/change.ts` | `executiveSummary` field on create/update/show |
| `.opencode/command/adv-review.md` | Phase 7: persist executive summary step |
| `.opencode/agents/adv.md` | Sign-Off Boundary: add `### Executive Summary` section |
| `.opencode/command/adv-archive.md` | Phase 1: add `executiveSummary: true` to include |

### 7. What stays the same

- `ARCHIVE_SUMMARY.md` generation (programmatic, no changes)
- Archive bundle copy logic (automatic — already copies all files)
- `updateArtifactMetadataSignal` handler in `workflows.ts` (generic over `ArtifactKind`)
- Test fixture factories (they call `createChangeScaffold` with optional params — new param is optional)
- `adv_change_validate` (no new validation rules)
- `change.json` schema (no new fields — artifact is file-only)
