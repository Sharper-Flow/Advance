## Design

This is a mechanical doc-and-config polish change. No architectural decisions remain after proposal lock-in. Design is fully specified by exact-edit recipes.

### Exact edits

**Edit 1 — H1 — Remove empty `## Output` section**

File: `.opencode/command/adv-improve.md`
Current (lines 173-175):
```
---

## Output
```
Target: delete those 3 lines (file ends after Phase 5 / Key Tools table).

**Edit 2 — M1 — Fix Phase 2 fallback ordering**

File: `.opencode/command/adv-improve.md` line 80
Current:
```
**Fallback:** If Context7 is unavailable → use local codebase conventions and annotate each finding with `[Reference: local conventions — Context7 unavailable]`. Do not fabricate canonical sources.
```
Target:
```
**Fallback:** If Context7 is absent → try `webfetch` against canonical docs URLs. If both Context7 and webfetch are unavailable → use local codebase conventions and annotate each finding with `[Reference: local conventions — Context7/webfetch unavailable]`. Do not fabricate canonical sources.
```

**Edit 3 — M2 — Expand manifest successors**

File: `plugin/src/manifest.ts` line 389
Current:
```typescript
successors: ["adv-proposal"],
```
Target:
```typescript
successors: ["adv-proposal", "adv-task", "adv-audit"],
```

**Edit 4 — M3 — Standardize year placeholder**

File: `.opencode/command/adv-improve.md` line 88
Current:
```
queries: ["{domain} alternatives comparison {year}", "{domain} emerging tools trends {year}"]
```
Target:
```
queries: ["{domain} alternatives comparison {current-year}", "{domain} emerging tools trends {current-year}"]
```

### Verification plan

| Step | Command | Expected |
|---|---|---|
| 1 | `pnpm test src/adv-improve-assets.test.ts` | 28 assertions pass |
| 2 | `pnpm run check` | typecheck + lint + format pass |
| 3 | `wc -l .opencode/command/adv-improve.md` | ≤ 182 lines (post-change ~172) |
| 4 | `grep -n "{year}" .opencode/command/adv-improve.md` | 0 hits |
| 5 | `grep -n "## Output" .opencode/command/adv-improve.md` | 0 hits |

### Validator skip rationale

Design validator (adv-researcher) is normally mandatory for design gate. Skipping is justified here because:
- No architectural decisions remain — H1 was the only design tradeoff and was resolved at proposal approval (user chose A).
- No external libraries / frameworks involved — pure repo doc + manifest edits.
- No new patterns introduced — all changes align with existing peer commands (`/adv-tron` for H1, existing fallback chains in other commands for M1).
- No contract-compromise risk — test surface explicitly preserved (28 assertions verified during discovery).

### Ordering

Tasks may be done in any order. Each edit is independent. Suggested order: M2 → H1 → M3 → M1 (smallest to largest), then run verification suite once.