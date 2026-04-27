# Scope Discovery Protocol

Canonical inline-approval protocol for non-campsite scope discovered during ADV
execution phases (`/adv-apply`, `/adv-review`, `/adv-harden`).

See also:
- `docs/command-voice-standard.md` § Inline Approval Voice
- `ADV_INSTRUCTIONS.md` § Large-Scope Validity

---

## Trigger Criteria

Present this prompt when **ALL** of the following are true:

1. The agent discovers work that was not in the original plan.
2. The discovered work is **NOT** P23-campsite-eligible (clear, safe, focused,
   adjacent fix — see `rules.yaml` P23).
3. The discovered work materially extends or contradicts the original
   objectives or acceptance criteria.

If the work **IS** P23-campsite-eligible, apply it freely without prompting.

---

## Tier A Inline Prompt

```
╔══════════════════════════════════════════════════════════════════╗
║  SCOPE DISCOVERY                                                 ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Discovered: {brief description of the unplanned work}           ║
║                                                                  ║
║  Original AC affected: {# or "none — new objective"}             ║
║  Campsite-eligible (P23): {yes/no — and why}                     ║
║                                                                  ║
║  Options:                                                        ║
║    reenter {gate}  — Reopen from proposal/discovery/design/...   ║
║    split           — Create fast-follow change for this scope    ║
║    keep            — Absorb into current change (may need        ║
║                      adv_change_reenter if AC/objectives change) ║
║    cancel          — Discard discovered scope                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Reply parsing (whitelist + LLM fallback):**

| Reply pattern | Action |
|---|---|
| `reenter` or `reenter {gate}` | Call `adv_change_reenter` from the specified gate |
| `split` | Call `adv_change_create parent_change_id: <current>` |
| `keep` | Absorb scope; if AC/objectives change → `adv_change_reenter` |
| `cancel` | Discard; document in task notes |
| Whitelist match (Tier A) | Proceed per match |
| Anything else | LLM fallback to nearest option; if ambiguous, re-prompt |

---

## Important: `keep` Does Not Bypass Re-entry

If the user chooses `keep` AND the absorbed scope adds new objectives or
acceptance criteria, the agent **MUST** invoke `adv_change_reenter` per
`rq-scopeReentry01`. The `keep` option is a user intent signal, not a
mechanical bypass of the re-entry protocol.

---

## Worked Example

**Scenario:** During `/adv-apply`, the agent discovers that AC #4 ("Add
webhook handler") actually requires changes to `src/queue.ts` which was not
in the original task graph. The fix is not P23-campsite-eligible because it
touches a new subsystem and adds a new dependency.

**Agent action:**
1. Halt current task.
2. Emit the Scope Discovery prompt with:
   - Discovered: "AC #4 requires queue subsystem changes (src/queue.ts)"
   - Original AC affected: "#4"
   - Campsite-eligible: "no — new subsystem + dependency"
3. Await user reply.

**User replies:** `reenter design`

**Agent action:**
1. Call `adv_change_reenter gateId: design`.
2. Continue from `/adv-discover` → `/adv-design` with expanded scope.
3. After prep re-approves, resume `/adv-apply`.

---

## Anti-Patterns

| × Bad | ✓ Good |
|---|---|
| Silent fold of non-campsite scope into current task | Emit this protocol |
| "We'll handle this later" without surfacing | Emit this protocol |
| Quietly trimming a planned task as "redundant" | Emit this protocol |
| Suggesting split based on size alone | Trust prep gate; use this protocol only for material scope discovery |
