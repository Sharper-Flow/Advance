# Design

## Architecture Overview

This change adds 4 vendored skills, 1 new capability spec, content-splits 5 existing skills, and patches 3 documentation files. Sync script gets a 4-line modification. No runtime code touched.

Two cross-cutting infrastructure choices emerged during design that affect every deliverable:

1. **Skill naming** — All vendored skills get `adv-` prefix to match the existing `scripts/sync-global.sh:1323` glob (`skills/adv-*/`).
2. **Skill sync scope** — Current sync at line 1333 (`cp "$skill_file" "$dest_dir/SKILL.md"`) copies SKILL.md only. Content-splits emit sibling `*.md` files that today wouldn't reach global skills dir. Sync extended to whole-directory copy (`cp -R "$skill_dir"/* "$dest_dir/"`).

Both decisions are formalized as ADRs (dogfooding the ADR rubric this change introduces).

## Key Decisions

### Decision 1: `adv-` prefix for vendored Pocock skills (ADR-001)

| Source | Vendored as |
|---|---|
| `mattpocock/skills/engineering/diagnose` | `skills/adv-diagnose/` (incl. `scripts/hitl-loop.template.sh`) |
| `mattpocock/skills/engineering/zoom-out` | `skills/adv-zoom-out/` |
| `mattpocock/skills/engineering/prototype` | `skills/adv-prototype/` (incl. `LOGIC.md` + `UI.md`) |
| `mattpocock/skills/productivity/write-a-skill` | `skills/adv-skill-author/` |

**Rationale:**
- Existing sync glob is `skills/adv-*/`; rename = one-time, broader glob = ongoing surface-area change
- `rq-sc02` reserves `adv-` for sync-managed skills, `agent-` for auto-created skills — vendored skills are sync-managed
- All 15 existing adv-* skills follow this convention; consistency aids agent skill-discovery
- Attribution preserved via SKILL.md header comment + `LICENSE-THIRD-PARTY.md`
- `write-a-skill` → `adv-skill-author` is a domain rename (matches our authoring-skill semantics); others are pure prefix-adds

**ADR-001 rubric check:**
- Hard-to-reverse: ✓ (consumers will reference `skill("adv-diagnose")`; renaming later costs propagation across instructions/commands)
- Surprising-without-context: ✓ (fork-with-renamed-skills is non-obvious)
- Result-of-real-tradeoff: ✓ (alt was broadening the sync glob to non-adv-prefixed)

### Decision 2: Sync copies whole skill directory (ADR-002)

Current sync (`scripts/sync-global.sh:1333`):
```bash
cp "$skill_file" "$dest_dir/SKILL.md"
```

New sync:
```bash
cp -R "$skill_dir"/* "$dest_dir/"
```

Preserves subdirectories (`scripts/`) and sibling reference docs (`REFERENCE.md`, `LOGIC.md`, `UI.md`, `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`, etc.).

**Rationale:**
- Without this, the 5-skill content-split (AC3) delivers offloaded content only to repo `skills/`, not to global — agents loading the skill globally see only the truncated SKILL.md → progressive disclosure broken
- `adv-diagnose` has `scripts/hitl-loop.template.sh` — required for skill functionality
- `adv-prototype` references `LOGIC.md` + `UI.md` for branch behavior — split is intentional
- Existing stale-removal logic (lines 1343-1355) already operates on whole directories — no change there
- Risk of accidental clobber: low; sync uses per-skill dest dir scoped to `~/.config/opencode/skills/{name}/`

**ADR-002 rubric check:**
- Hard-to-reverse: medium (changes consumer expectations re: skill file layout)
- Surprising-without-context: ✓ (sync historically SKILL.md-only)
- Result-of-real-tradeoff: ✓ (alt was inline-everything-in-SKILL.md, which damages progressive disclosure)

### Decision 3: `domain-context` capability spec scope

New spec `.adv/specs/domain-context/spec.json` with 2 requirements:

- `rq-domainContext01` — CONTEXT.md format and consumers (`/adv-discover` MAY read, `/adv-design` MAY append, `/adv-clarify` MAY read for domain alignment)
- `rq-domainContextADR01` — docs/adr/NNNN-slug.md format, ADR-sparingly rubric (3 criteria), consumers (`/adv-design` MAY emit when rubric met, no auto-generation)

Both requirements use `priority: should` (not `must`) — these are advisory artifacts. Consistent with existing should-priority specs (advance-delivery, slop-scan rq-ss005, tdd-contract rq-TDD003na, worktree-lifecycle, prep-readiness).

Spec promotion path stays open (future change can promote to `must` once adoption is widespread).

### Decision 4: Content-split methodology for 5 target skills

Per-skill split plan (informed by domain cohesion audit during Phase 3 design):

| Skill | Current | Target SKILL.md | Sibling docs |
|---|---|---|---|
| `adv-triage` | 638 | ≤150 (index + core triage flow) | `WSJF.md`, `BOOTSTRAP.md`, `SCHEMA.md`, `PROMPTS.md`, `ANTI-PATTERNS.md` |
| `adv-ci-release` | 388 | ≤150 (index + architecture) | `CI_WORKFLOW.md`, `AUTO_RELEASE_WORKFLOW.md`, `COMMIT_CONVENTIONS.md`, `TROUBLESHOOTING.md` |
| `adv-slop-detection` | 230 | ≤150 (index + Phase 1/2 flow) | `CATEGORIES.md` (detection rules), `STRUCTURAL_CORRECTNESS.md` (QUAL-012), `DEAD_CODE.md` |
| `adv-backend-stack-eval` | 199 | ≤150 (index + tier table + load triggers) | `LANGUAGE.md`, `DATABASE.md`, `ASYNC.md`, `API.md` |
| `adv-audit` | 189 | ≤200 (cohesive; SKILL.md keeps gates + analysis dimensions) | `REPORT_SCHEMA.md` (JSON shape + sub-agent packet) |

SKILL.md core after split: front matter + Purpose + when-to-load + index of sibling docs + the most-used flow/rubric.

Sibling docs use plain Markdown (no XML wrappers required for ADV-bundled skills; Pocock's `<what-to-do>` / `<supporting-info>` pattern is used for the 4 vendored skills as-is for fidelity).

### Decision 5: ADV_INSTRUCTIONS.md patch shape

Two additive patches, no deletions:

1. **Doom Loop Detection section** — add "See also" line at end referencing `skill("adv-diagnose")` Phase 1 (feedback-loop construction) as the recommended pre-escalation protocol.

2. **Skill Discovery Protocol section** — add new subsection "Excluded Skills" listing 6 Pocock skills with one-line rationale.

### Decision 6: `/adv-design` ADR rubric integration

Patch `.opencode/command/adv-design.md` Phase 2 to reference the ADR-sparingly rubric. Two additive changes:

1. Phase 2 step 2 ("Key decisions and rationale") gains a footnote: "Decisions meeting all 3 ADR-sparingly criteria (hard-to-reverse + surprising-without-context + result-of-real-tradeoff) SHOULD be drafted as ADRs in `docs/adr/NNNN-slug.md`. See `.adv/specs/domain-context/` and ADR-FORMAT.md."

2. Phase 3 design.md template gains optional `## ADR Drafts` section that lists candidate ADRs (drafts, not gate-blocking).

## Implementation Strategy

Sequenced to land sync-extension first (unblocks AC1 + AC3), then content (skills, specs, docs).

| Phase | Tasks | Why ordered here |
|---|---|---|
| **P1: Sync extension (ADR-002)** | Modify `scripts/sync-global.sh:1322-1338` skill-copy block to whole-dir. `--dry-run --diff` verifies no regression on existing skills. Write ADR-002 in `docs/adr/`. | Unblocks all skill-dependent ACs. |
| **P2: Vendor 4 skills** | Pull SKILL.md + supporting files for each Pocock skill, rename to `adv-*`, add MIT attribution headers. Create `LICENSE-THIRD-PARTY.md`. Write ADR-001 in `docs/adr/`. | After P1; verifies sync extension works on the new whole-dir vendored skills. |
| **P3: New `domain-context` capability spec** | Author `.adv/specs/domain-context/spec.json` with 2 requirements. Verify via `adv_spec list`. Add asset test if pattern exists. Co-locate `ADR-FORMAT.md` + `CONTEXT-FORMAT.md` as reference docs. | Independent from P1/P2 but ordered here because P6 references the spec. |
| **P4: Content-split 5 largest adv-* skills** | Per skill: extract sub-domain content into sibling `*.md` files per Decision 4 plan; SKILL.md becomes index + core protocol. Verify references in commands/instructions still resolve. Update `docs/prose-load-inventory.md` per `rq-proseReduction03` with new rows (AC8). | Depends on P1 (sibling files must sync globally to be useful). |
| **P5: Patch ADV_INSTRUCTIONS.md** | Doom Loop See-also link; Excluded Skills subsection. | After P2 to reference `adv-diagnose` correctly. |
| **P6: Patch `/adv-design`** | Phase 2 footnote + Phase 3 optional ADR Drafts section. | After P3 to reference `domain-context` spec correctly. |
| **P7: Verification** | `pnpm run check` + `pnpm test`. Run `./scripts/sync-global.sh --dry-run --diff` to confirm new skills + offloaded files sync. Manual confirm reference integrity per refactored skill. | Last; satisfies AC7. |

**TDD intent per phase:**
- P1: `inline` — verify sync behavior via `--dry-run --diff` snapshot before/after; if shell-test harness available, add structural test
- P2: `not_applicable` — content vendoring, no logic
- P3: `inline` — asset test verifies `adv_spec list` returns `domain-context` with 2 requirements
- P4: `not_applicable` — content split, no logic; verification is reference-integrity audit
- P5/P6: `not_applicable` — doc patches
- P7: `separate_verification` — verification task running full check + test suite + sync dry-run

## LBP Analysis

**Long-term best practice considerations:**

1. **Cherry-pick, don't fork.** Pocock's README explicitly contrasts his approach with gate-machine frameworks. ADV IS a gate-machine framework. Cherry-pick is the only coherent path; full adoption would degrade ADV's gate enforcement to skill-flavored conventions.

2. **Adopt the artifact pattern, not the workflow skills that maintain them.** Pocock's `grill-with-docs` maintains CONTEXT.md inline during clarification. ADV's `/adv-clarify` + `/adv-design` are the equivalent owners. The artifacts (CONTEXT.md, docs/adr/) are durable knowledge; their maintenance method matches the gate-machine boundaries.

3. **Sync mechanism is the structural lever.** Extending sync to copy whole skill dirs unlocks progressive disclosure for all skills, not just the 5 in scope. Future skills authored under `adv-skill-author` inherit the pattern.

4. **`adv-` prefix isn't dogmatic, but it's the path of least churn.** Alternative was broadening the sync glob; that's a bigger blast radius. The prefix also enforces `rq-sc02` (sync-managed vs auto-created skill distinction).

5. **`should` priority on the new spec, not `must`.** CONTEXT.md/ADR adoption is opt-in across projects. Locking it to `must` would break uptake. Future change can promote when adoption is widespread.

6. **Content-splitting is orthogonal to enforcement-class compression.** ADV's T6 pass (`rq-skillProseCompression01`) compressed prose → structured tables. Pocock's pattern splits single-file → multi-file with index. Both apply. AC3 originally conflated them; revised to drive splits by domain cohesion, not arbitrary line cap.

## Affected Components

| Path | Action | Risk |
|---|---|---|
| `scripts/sync-global.sh` (line 1322-1338) | Modify skill-copy block to whole-dir | Low — well-isolated bash block |
| `skills/adv-diagnose/` | New (SKILL.md + scripts/hitl-loop.template.sh) | None |
| `skills/adv-zoom-out/` | New (SKILL.md only) | None |
| `skills/adv-prototype/` | New (SKILL.md + LOGIC.md + UI.md) | None |
| `skills/adv-skill-author/` | New (SKILL.md only, renamed from write-a-skill) | None |
| `skills/adv-triage/` | Content-split (638 → ≤150 + 5 sibling docs) | Medium — large content move; reference integrity matters |
| `skills/adv-ci-release/` | Content-split (388 → ≤150 + 4 sibling docs) | Low |
| `skills/adv-slop-detection/` | Content-split (230 → ≤150 + 3 sibling docs) | Low |
| `skills/adv-backend-stack-eval/` | Content-split (199 → ≤150 + 4 sibling docs) | Low |
| `skills/adv-audit/` | Content-split (189 → ≤200 + 1 sibling doc) | Low |
| `.adv/specs/domain-context/spec.json` | New | None |
| `ADV_INSTRUCTIONS.md` | Patch (Doom Loop See-also; Excluded Skills subsection) | Low |
| `.opencode/command/adv-design.md` | Patch (Phase 2 footnote; Phase 3 ADR Drafts) | Low |
| `LICENSE-THIRD-PARTY.md` | New | None |
| `docs/prose-load-inventory.md` | Update rows for 5 split skills per `rq-proseReduction03` | Low |
| `docs/adr/0001-adv-prefix-vendored-skills.md` | New (ADR-001) | None |
| `docs/adr/0002-skill-sync-whole-directory.md` | New (ADR-002) | None |
| Existing tests | None expected; verify no snapshot drift | Low |

## ADR Drafts

This change uses its own ADR rubric to record two decisions:

- **ADR-001: `adv-` prefix for vendored Pocock skills** (Decision 1 above)
- **ADR-002: Sync copies whole skill directory, not SKILL.md only** (Decision 2 above)

Both land in P1/P2 as `docs/adr/0001-adv-prefix-vendored-skills.md` and `docs/adr/0002-skill-sync-whole-directory.md`.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Content-split of adv-triage (638 → ≤150) loses content | Move to sibling docs, not delete. Pre/post line-count audit confirms total content preserved. References updated in same task. |
| Sync change breaks existing skill installs | Strictly additive (copies more, doesn't delete). Verify with `--dry-run --diff` before commit. Existing single-file skills unaffected (cp -R on one-file dir = same outcome). |
| LICENSE attribution misses a file | One-time audit task comparing vendored content against source repo. Verification: per-skill SKILL.md header references source path. |
| Skill refactor breaks a reference in a command file | AC7 test suite + grep audit (`grep -rn "adv-triage" .opencode/command/` etc.). Per-skill task verifies references before completing. |
| New `domain-context` spec causes `adv_change_validate` failure | Spec uses `should` priority — non-blocking. Verify with `adv_change_validate` during P7. |
| `/adv-design` patch breaks existing design output for in-flight changes | Patches are additive (footnote + optional section). Existing template stays valid. |
| Prose-load inventory rows drift from actual file structure | AC8 audit verifies per-skill row matches post-refactor file structure. |
| Compromise/AC3 reframe miscommunication | Recorded in agreement.md "Design Compromise" section with approval evidence. |

## Validator Result

```
DESIGN_VALIDATION:
  verdict: CAUTION
  findings:
    - D1 (caution): rq-skillProseCompression01 / rq-proseReduction03 inventory obligation initially missed in P4 → resolved by adding AC8 (inventory update) and reframing AC3 (cohesion-driven splits, not arbitrary line cap)
    - D2 (info): rename + sync extension is minimal correct path; no simpler alternative
    - D3 (info): no spec conflicts; `should`-priority domain-context spec consistent with established convention
    - D4 (caution): scope breadth initially flagged → resolved by per-skill cohesion audit confirming all 5 benefit from split; AC3 reframe removes the arbitrary line-cap burden
  recommendation: incorporate inventory update sub-task; verify per-skill split has clear signal — both done
```

Both validator cautions resolved via design revision. No outstanding CONFLICT findings.