## Implementation Strategy

Issue ↔ change linkage automation across 7 surfaces. Three are pure spec edits (markdown command files); four are typed code additions (storage helper, sanitizer module, firewall extension, two test files). All ride P33 (structural correctness) and P32 (trunk-is-prod via worktree merge).

## Per-Scope Design

### S1. `/adv-proposal #N` body prefill (spec)

`.opencode/command/adv-proposal.md` Pre-flight step 2 currently reads `Resolve summary from $ARGUMENTS or derive a 2-5 word summary`. Extend to:

1. Detect `#N` prefix via regex `/^#(\d+)\b/`. If matched, capture `N`.
2. `gh issue view <N> --json title,body,labels,number,state` — abort on non-zero with stderr verbatim + `gh auth status` hint (never partial change creation).
3. Run body through `sanitizeRoadmapOrigin()` (S6).
4. Use sanitized body as basis for the problem statement Phase 1 synthesis. Use issue title as fallback summary if user didn't supply one.
5. At `adv_change_create` call site (Phase 2), pass `origin_kind: 'roadmap'`, `origin_issue_number: N`.
6. Surface issue title + labels + state in change context output.

No new `--issue` flag — positional `#N` is conventional GH syntax.

### S2. `/adv-archive --close-issue` (spec + behavior)

`.opencode/command/adv-archive.md` Phase 9 Git Finalization. Add new sub-step **Phase 9.6 (post-push, pre-summary)**:

```
If --close-issue was passed (parsed in pre-flight) AND change has
origin.kind ∈ {'roadmap', 'triage'} AND origin.issue_number is set:

  1. gh issue comment <N> -b "Shipped via {change-id} — archived {ISO-date}"
  2. gh issue close <N> --reason completed

  Idempotency: gh natively handles already-closed issues (exit 0, no API
  mutation). Just check exit code: 0 = success, non-zero = surface as
  [ADV:ATTN] post-archive warning with stderr + manual-close command.
  Local archive state stays canonical; no rollback.
```

> **Refined per validator:** dropped the "already closed" string-matching path. Validator confirmed `gh issue close` returns exit 0 for already-closed issues (cli/cli `pkg/cmd/issue/close/close.go`). Plain exit-code check is sufficient.

Default-off. Spec adds explicit anti-pattern: "Auto-close issue without `--close-issue` flag — first-time surprise = bug". Project-level persistent opt-in deferred (separate change if needed).

### S3. `/adv-triage` Phase 3a triage-origin (spec)

`.opencode/command/adv-triage.md` Phase 3a (line 175). After `gh issue create` captures issue number, add instruction: "If the user immediately starts work via `/adv-proposal` after promotion, that proposal MUST pass `origin_kind: 'triage'`, `origin_source_artifact: '<promoted-from-ref>'`, `origin_issue_number: <created-issue>` to `adv_change_create`. The promotion itself does NOT auto-create a change; the user decides."

Spec-only. No code change.

### S4. `/adv-roadmap` Phase 2 recommendations (spec)

`.opencode/command/adv-roadmap.md` Phase 2 recommendation table currently shows `/adv-proposal "{summary}" --origin roadmap --issue #{n}` (forward-looking placeholder). Update to use the canonical `/adv-proposal #N` positional syntax landing in S1. Drop the `--origin` and `--issue` flag forms (we picked positional in S1).

### S5. `github_project` config migration (typed code)

New file: `plugin/src/storage/github-project-config.ts`

```ts
export const GitHubProjectConfigSchema = z.object({
  owner: z.string().min(1),
  project_number: z.number().int().positive(),
  project_id: z.string().min(1),
  title: z.string().min(1),
  fields: z.object({
    adv_type: z.string(),
    priority: z.string(),
    value: z.string(),
    time_criticality: z.string(),
    rroe: z.string(),
    effort: z.string(),
    wsjf: z.string(),
  }),
  adv_type_options: z.record(z.string(), z.string()),
  priority_options: z.record(z.string(), z.string()),
  persisted_by: z.string().optional(),
  persisted_at: z.string().optional(),
});

export async function readGitHubProjectConfig(repoRoot: string, externalRoot: string | null): Promise<GitHubProjectConfig | null>;
export async function writeGitHubProjectConfig(repoRoot: string, config: GitHubProjectConfig): Promise<void>;
```

`readGitHubProjectConfig`:
1. Try `.adv/github-project.json` (preferred path).
2. If missing → try `project_metadata['github_project']` (legacy fallback). Parse summary; if valid, write forward to `.adv/github-project.json` (one-shot migration), then return.
3. If both missing → return `null`.
4. **Do NOT delete the legacy entry** post-migration. Validator-confirmed: leaving it is inert (reads always prefer the new file); deleting adds partial-failure risk for zero benefit.

`writeGitHubProjectConfig`: atomic write via `atomicWriteFile` (`plugin/src/utils/fs.ts:941-1694`) + `acquireFileLock` (`plugin/src/utils/fs.ts:2112-4408`). Pattern matches `writeProjectMetadataEntry` in `plugin/src/storage/project-metadata.ts:122-147` (validator-confirmed canonical pattern; lock files at `{target}.lock` so `.adv/github-project.json` and `.adv/project-metadata.json` don't interfere). Path: `<repoRoot>/.adv/github-project.json`. Caller is `/adv-triage` Phase 0 bootstrap.

`adv_roadmap` source:'live' is updated to call `readGitHubProjectConfig(store.paths.root, store.paths.external)` instead of `readProjectMetadata(...)`. Same data, correct path.

### S6. Sanitizer (rq-roadmapOriginSanitize01)

New file: `plugin/src/utils/roadmap-origin-sanitize.ts`

```ts
interface SanitizeResult {
  sanitized: string;
  warnings: string[];
}

/**
 * Strip ADV-emitted scoring fields from a roadmap-origin issue body
 * before proposal synthesis (rq-roadmapOriginSanitize01).
 *
 * Known limitation: pattern 2 strips any line starting with `Value:`,
 * `WSJF:`, etc. — even legitimate user prose. In practice, issue bodies
 * rarely start a line with one of these tokens followed by `:` or `=`,
 * but the false-positive surface is real. If user prose conflicts,
 * promote the line off column-0 (e.g., add a leading bullet).
 */
export function sanitizeRoadmapOrigin(body: string): SanitizeResult;
```

Strip patterns (in order, all use `m` flag where `^` anchor is needed):
1. `<!-- adv-triage:scoring v1[\s\S]*?-->` — multiline HTML comment block (no `m` needed; `[\s\S]*?` already crosses lines).
2. `^(WSJF|Value|TimeCriticality|RROE|Effort)\s*[:=].*$` with `m` flag — single-line score field.
3. `^(WSJF|Value)\s*score\s*[:=].*$` with `m` flag — defensive trailing scoring summary line.

> **Refined per validator:** explicit `m` flag specified for patterns 2-3. Without it, `^` matches only at string-start, missing per-line semantics.

Conservative behavior: unrecognized scoring-shaped markers (e.g., a future `Risk=...` line ADV doesn't currently emit) emit a warning but are NOT stripped. Test fixture: real promoted issue body (#87, #88, etc. — issues we created via `/adv-triage`).

Module is shared. `/adv-proposal #N` (S1) calls it. `enforcescoreblindproposaldesig` extends/refines it (their scope item 6 — "Define sanitizer contract"). Both changes reference `rq-roadmapOriginSanitize01` in deltas. Validator-confirmed split is non-conflicting and either ship order is safe.

### S7. Trunk-firewall extension (typed code)

`plugin/src/tools/trunk-write-firewall.ts`. Current allowlist is basename-at-root only. Replace with relative-path Set:

```ts
const TRUNK_GENERATED_ARTIFACTS = new Set<string>([
  "ROADMAP.md",
  "CHANGELOG.md",
  ".adv/github-project.json",
  ".adv/roadmap-snapshot.json",
]);

function isAllowlistedTrunkArtifact(targetPath: string, projectRoot: string): boolean {
  const rel = relative(projectRoot, targetPath).split(sep).join("/");  // POSIX-normalize
  if (rel === "" || rel.startsWith("..")) return false;
  return TRUNK_GENERATED_ARTIFACTS.has(rel);
}
```

Tests in `trunk-write-firewall.test.ts`:
- Positive: `ROADMAP.md`, `CHANGELOG.md` (existing); `.adv/github-project.json`, `.adv/roadmap-snapshot.json` (new) at exact path.
- Negative: `.adv/something-else.json` (not allowlisted), `nested/.adv/github-project.json` (different parent path), `nested/ROADMAP.md` (basename match only at root rejected).
- Edge: trailing slash on target path (`relative()` strips it; allowlist entries don't have one).

> **Refined per validator:** explicit firewall tests for `.adv/roadmap-snapshot.json` added — currently `/adv-triage` writes it via bash (which goes through the bash classifier), not file-tool. After this change, file-tool writes also work end-to-end.

## Spec Deltas

- `rq-issueChangeLinkage01`: `/adv-proposal #N` MUST resolve issue body via `gh issue view`, sanitize via `rq-roadmapOriginSanitize01`, set `origin.kind='roadmap'` + `origin.issue_number=N` on the created change.
- `rq-issueChangeLinkage02`: `/adv-archive --close-issue` MUST be opt-in; default-off behavior MUST NOT mutate GH state. Exit-code check (no string matching). Failure non-fatal: `[ADV:ATTN]` warning, archive state canonical.
- `rq-issueChangeLinkage03`: `github_project` linkage config MUST live in `.adv/github-project.json` with dedicated Zod schema; `project_metadata['github_project']` is read-only legacy fallback that migrates forward on first read; legacy entry NOT deleted post-migration.
- Consumes `rq-roadmapOriginSanitize01` (defined by `enforcescoreblindproposaldesig`); both changes ship the regex patterns symmetrically. Implementation in this change; refinement / additional test fixtures in theirs.

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Sanitizer regex strips legitimate user prose containing `Value:`/`WSJF:` at column 0 | Documented in module JSDoc as known limitation. Test fixture covers user prose with the word "value" inside a sentence (not at column 0). False-positive surface acknowledged in design § Sanitizer. |
| `gh issue close` flakiness mid-archive | Native idempotency (validator-confirmed exit 0 on already-closed). Other failures: non-fatal `[ADV:ATTN]` warning. Archive state canonical. |
| Migration races: two sessions read legacy `project_metadata['github_project']` simultaneously, both write forward | Atomic write + file lock on `.adv/github-project.json`. Last writer wins (idempotent — same data). |
| Trunk-firewall regex change breaks unrelated paths | Test coverage: explicit positive + negative + edge cases enumerated above. |
| Sanitizer + `enforcescoreblindproposaldesig` divergence | Both changes share `rq-roadmapOriginSanitize01` ID. Additive-only semantics; either ship order safe (validator-confirmed). |
| `--close-issue` flag invoked on change with no origin | Surface `[ADV:ATTN] origin.issue_number not set; nothing to close.` Don't error out. |
| Direct `adv_change_create(origin_issue_number)` calls bypass sanitization | Acceptable per design constraints — `origin` is set-on-create, `/adv-proposal #N` is the canonical entry point, direct API calls are power-user territory. |

## Ship Order

This change MAY ship before `enforcescoreblindproposaldesig`. Validator-confirmed: their proposal explicitly states "implementation deferred to wireIssueChangeLinkage" (line 10). If this change ships first, the implementation exists without the spec delta — acceptable. If theirs ships first, the spec delta exists without implementation — also acceptable. Additive-only via shared `rq-roadmapOriginSanitize01` ID.

ROADMAP.md format change is theirs alone — this change does NOT touch ROADMAP.md generation.

## Validator Verdict (adv-researcher)

**VALIDATED** with 5 refinements (all incorporated above):
1. Dropped "already closed" string-matching from S2 — gh natively idempotent.
2. Explicit regex `m` flag in S6 patterns 2-3.
3. Confirmed: don't delete legacy `project_metadata['github_project']` on migration.
4. Added `.adv/roadmap-snapshot.json` to firewall test coverage.
5. Documented sanitizer false-positive surface as JSDoc known-limitation.

Sources cited by validator (canonical references):
- `gh issue close` idempotency: cli/cli `pkg/cmd/issue/close/close.go`
- `atomicWriteFile`/`acquireFileLock` canonical pattern: `plugin/src/storage/project-metadata.ts:122-147`
- `ProjectMetadataEntrySchema.summary.max(200)` constraint: `plugin/src/types/project.ts:186-199`
- `/adv-triage` scoring template: `.opencode/command/adv-triage.md:347-358`
- Coordination with `enforcescoreblindproposaldesig`: their proposal lines 10, 65, 87 confirm split.