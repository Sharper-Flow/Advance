## Cross-Project Origin

This change was created as a follow-up from **toolbox**.

| Field | Value |
|-------|-------|
| Source project | toolbox |
| Source path | `/home/jon/toolbox` |

> **Note:** The originating project should be consulted for context on why this change is needed.


## Why

GPT-family ADV sessions under-specify acceptance criteria and skip clarification during idea/problem/proposal/discovery. Root cause (investigated this session): GPT-5.5 reads prompts literally; the global caveman `full` overlay + ADV terse voice contract instruct compression of "detail/hedging" — and AC drafting + Socratic clarification ARE that detail. The AC-quality bar (measurable/testable) and the clarification license live far from the drafting instruction and are outweighed by emphatic "never pause / no shall-I-continue" rules. Symptom is GPT-specific because literal reading honors the compression edge that other families ignore.

## What Changes

Add ~3 directives to the model-isolated `PROVIDER_HINTS.gpt` block in `plugin/src/utils/system-block.ts`. This block is emitted only when `currentProviderID === "openai"` (`PROVIDER_HINT_BY_PROVIDER_ID`), so the change reaches GPT-family sessions only and never touches claude/glm/kimi hints.

Directives (final wording firmed in design):
1. Requirements text (acceptance criteria, clarifying questions, problem statements) is exempt from brevity/voice/compression rules — never abbreviate or drop it.
2. Each acceptance criterion must be binary pass/fail, name an observable signal, and be bounded (number/threshold/state); reject subjective terms (fast/easy/robust/clean) and rewrite before presenting.
3. Clarifying questions during idea/problem/proposal/discovery are required work, not "shall I continue?" prompts — the no-pause/auto-continue rules never suppress them.

## Success Criteria

- SC1: `PROVIDER_HINTS.gpt` carries the 3 new directives after the change.
- SC2: `PROVIDER_HINTS.claude`, `.glm`, `.kimi` strings are byte-identical to pre-change (no cross-family regression).
- SC3: For `currentProviderID: "openai"`, assembled system block contains each new directive; for `"anthropic"`/`"unknown"`/`null`, behavior is unchanged (one claude hint / none / none).
- SC4: `system-block.test.ts` and the advance-meta provider-hint metrics tests pass.
- SC5: `pnpm run build` and `deploy-local.sh --fix` complete clean.

## Scope

### In Scope
- Edit `PROVIDER_HINTS.gpt` in `plugin/src/utils/system-block.ts`.
- Add/extend assertions in `plugin/src/utils/system-block.test.ts` for the new directives + claude/glm/kimi non-regression.
- Build + deploy.

### Out of Scope
- Caveman overlay base (`caveman-config.cjs`) — global, affects all models.
- Shared command files (`adv-discover.md`, `adv-proposal.md`, `adv.md`) — affect all models.
- Other provider families (claude/glm/kimi).
- Per-model-version (gpt-5.5-only) targeting — no structural hook exists; family scope is the boundary.
- The general locality problem (AC bar far from drafting point) in shared files.

### Must Not
- Regress claude/glm/kimi provider-hint bytes or behavior.
- Touch the caveman compression overlay.
- Introduce a hard prompt-size cap as correctness proof (forbidden by advance-meta spec).

## Affected Code

- `plugin/src/utils/system-block.ts` — `PROVIDER_HINTS.gpt` (lines ~121–134).
- `plugin/src/utils/system-block.test.ts` — provider-hint section (~290–333).

## Constraints

- Isolation granularity is provider family `gpt` (openai), not model version. Acceptable: directives help all GPT versions, harm none.
- Stay within advance-meta spec: exactly one matching hint per identity; none for unknown; metrics report hint bytes/lines without a hard cap.
- Keep added lines lean (provider-hint size feeds the metrics plane).

## Impact

Low blast radius: one pure data block, runtime-injected, family-gated. No spec delta. No overlay regeneration. Requires build + deploy + OpenCode restart (host-loaded module).

## Context

Investigation evidence: OpenAI GPT-5.5 docs ("interprets prompts literally"; "higher effort isn't automatically better with conflicting instructions / weak stopping criteria / open-ended tool access"; "treat reasoning.effort as a tuning knob, not the primary way to recover quality"). Caveman `full` overlay confirmed injected per-call with no AC/clarification carve-out (`caveman-config.cjs:85,102–107`). Existing gpt hint already carries completion-discipline directives (`system-block.ts:121–134`) — this extends the same pattern.

## Discovery Agenda

- Verify the advance-meta provider-hint metrics test does not pin exact hint byte count (spec forbids hard cap; low risk).
- Firm exact directive wording so the compression-exemption is phrased as an explicit exception a literal reader resolves in favor of requirements detail (vs the caveman overlay).
- Confirm directive count/length keeps the gpt hint proportionate to other families.