## Implementation Strategy

### Change A: Fix `adv-task` manifest entry

**File:** `plugin/src/manifest.ts` (line ~286-291)

```ts
"adv-task": {
  scope: {
    gates: ["proposal", "discovery", "design", "planning"],  // was ["discovery", "planning"]
  },
}
```

Aligns the manifest with `adv-task.md:11` ("Crosses boundaries intentionally (fast-track exemption): completes proposal + discovery + design + planning gates."). One-line change.

### Change B: Extend `validateGateBoundary` with user-actor skip

**File:** `plugin/src/tools/gate.ts` (function at line 364, currently 607-642)

Add a short-circuit BEFORE the `COMMAND_MANIFEST` iteration:

```ts
function validateGateBoundary(
  gateId: GateId,
  completedBy: string,
): string | undefined {
  // User-driven completions bypass the boundary check.
  // The "user" / "user:*" convention marks human actors with explicit authority.
  if (completedBy === "user" || completedBy.startsWith("user:")) {
    return undefined;
  }

  // existing manifest scan...
}
```

Placement: BEFORE the manifest scan (per validator rec #3) — avoids unnecessary work for human-driven completions and reads as a fast-path guard.

### Change C: Document the convention

**File:** `plugin/src/tools/gate.ts` (line 380-383, `completedBy` field describe)

Update the field describe to document the user-actor convention:

```ts
completedBy: z
  .string()
  .optional()
  .describe(
    "Who completed the gate (default: agent). Values matching `user` or starting with `user:` are treated as human actors with explicit authority and bypass the manifest-driven boundary check; agent values are validated against the command manifest's gate ownership."
  ),
```

### Change D: Tests

**File:** `plugin/src/tools/gate.test.ts` (extend existing test file)

Add a `validateGateBoundary` test block:
- AC1: assert `COMMAND_MANIFEST["adv-task"].scope?.gates` includes all four gates
- AC2: `validateGateBoundary("proposal", "user")` → `undefined`
- AC3: `validateGateBoundary("proposal", "user:cli")` → `undefined`
- AC5: `validateGateBoundary("proposal", "frobnicate")` → string containing `"adv-proposal"`
- AC6: `validateGateBoundary("proposal", "adv-task")` → `undefined` (manifest fix)
- Existing AC4 coverage may already exist; verify or add.

`validateGateBoundary` is currently file-private. Either export it for testing, or test through `adv_gate_complete.execute` end-to-end. Decision: export with internal-use comment to keep tests focused; the function has no side effects so exporting is low-risk.

### TDD ordering

1. RED: write all 5 unit tests against current (broken) state. Expect AC2, AC3, AC6 to fail; AC4, AC5 to pass.
2. GREEN: apply Change A (manifest), Change B (skip logic), Change C (docstring). Expect all 5 tests pass.
3. Verify: `pnpm run check`, `pnpm test`.

### Key decisions

| Decision | Rationale |
|----------|-----------|
| Skip on `completedBy === "user"` / `startsWith("user:")`, NOT `userApproved` | Validator recommendation: keep HITL-approval and identity-authority orthogonal (P04 locality) |
| Place skip BEFORE manifest scan | P19 simplicity + skip cost is O(1) vs O(n) scan |
| Export `validateGateBoundary` for unit testing | Keeps tests focused; function is pure and side-effect-free |
| Fix `adv-task` manifest in same change | Validator surfaced this as the dominant real-world false-positive source; deferring would leave the noise it cited as motivation |
| Defer manifest audit of other commands | Out of scope for fast-track. Only `adv-task` was identified |

### Risks

- **Low**: `validateGateBoundary` export changes module surface — minor. Mitigated by keeping function private to module's intended consumer (just gate.ts and its test).
- **Very low**: Other commands besides `adv-task` could have similar manifest gaps — out of scope, but worth noting for follow-up agenda.

### Validator verdict: CAUTION → adopted recommendations

All four validator recommendations applied. Verdict moved from CAUTION to executable design.
