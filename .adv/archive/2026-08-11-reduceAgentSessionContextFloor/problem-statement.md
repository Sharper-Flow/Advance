Every ADV agent session — primary and every spawned sub-agent — eagerly loads a 76,565-byte (~19.1k token) instruction floor before any work begins.

OpenCode's instruction loader takes no agent parameter (`packages/opencode/src/session/instruction.ts`; `session/prompt.ts:1257-1267`), and `tool/task.ts` re-runs the same prompt assembly for every spawned session. The floor is therefore re-paid per sub-agent: a 3-worker apply phase costs ~306 KB / ~76k tokens of fixed instruction context across the session tree before a single file is read.

The cost is badly distributed. For `adv-ci-waiter` the floor is 94% of its entire prompt, and nearly all of it is structurally inapplicable — that agent denies `edit`, `morph_edit`, `task`, and all `adv_*` tools, yet receives `morph-tools.md`, `lgrep-tools.md`, and the full P04/P23/P24/P29/P41 rule set.

The floor is also unmeasured. `.opencode/token-budgets.json` budgets per-command line counts — the lazily-loaded, load-once surface — and has no entry for `instructions[]`, agent manifests, or the skill catalog. The eager, sub-agent-multiplied surface drifts silently.

Desired outcome: cut the eager per-session floor to a defensible size with no loss of enforced behavior, and make the reduction regression-proof with a structural budget check rather than prose guidance.