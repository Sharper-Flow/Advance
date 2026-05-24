# Add preview URLs

## Why

Acceptance-stage sign-off can be incomplete when delivered work includes front-end or browser-visible elements but the user is not given a dev-environment URL to inspect the result. Users need a concrete preview link during acceptance so visual and interactive changes can be verified before accepting the work.

## What Changes

- Update the ADV acceptance workflow so front-end/browser-facing work requires a preview URL in the acceptance summary.
- Define front-end applicability signals: UI components, browser-facing routes, visual styling, client-side interactions, docs/site pages, or web app behavior.
- Require the preview URL to come from the active dev environment when available.
- Require explicit surfacing when no dev URL is available, including why and what verification was used instead.
- Carry this rule into durable workflow/spec surfaces so acceptance behavior remains consistent across sessions and agents.

## Success Criteria

- `/adv-review` acceptance output includes a `Preview URL` entry before the user acceptance prompt whenever the delivered work includes front-end/browser-visible elements.
- The preview URL is sourced from the running dev environment or equivalent local/remote preview environment, not invented.
- If no preview URL can be produced, the acceptance summary states `Preview URL: unavailable` with the concrete blocker or fallback evidence.
- Non-front-end changes are not required to include a preview URL.
- Tests or documentation checks verify the rule is encoded in the command/spec contract.

## Scope

### In Scope

- Acceptance-stage `/adv-review` instructions and output contract.
- ADV workflow/spec requirement for front-end preview URLs.
- Tests or drift checks needed to keep command/spec behavior aligned.
- Definition of front-end applicability and unavailable-URL fallback behavior.

### Out of Scope

- Building a new dev server manager.
- Automatically launching front-end applications.
- Adding browser automation as a universal acceptance requirement.
- Changing archive/release sign-off behavior beyond preserving acceptance evidence.

### Must Not

- Must not fabricate URLs from assumptions.
- Must not block non-front-end acceptance on missing preview URLs.
- Must not require public deployment when local dev preview is sufficient.
- Must not bypass existing acceptance checkpoint or contract review matrix requirements.

## Affected Code

- `.opencode/command/adv-review.md` — acceptance summary and prompt contract.
- `.adv/specs/advance-workflow/spec.md` — durable workflow requirement, if discovery confirms spec law placement.
- `docs/specs/advance-workflow.md` or related generated/manual spec docs, if maintained by this repo.
- Command/spec drift tests if existing coverage requires updates.

## Related Repositories

- Current repo only (`advance`).

## Constraints

- Preserve the seven-gate model and acceptance checkpoint semantics.
- Keep correctness structural: spec/command/test contract should own the rule, not memory or heuristic-only prompting.
- Use terse Gate Handoff Voice and existing Inline Approval Voice.

## Impact

- Users reviewing front-end changes get an actionable preview link before acceptance.
- Agents must distinguish front-end-impacting work from backend-only or workflow-only changes.
- Missing preview environments become explicit caveats instead of silent omissions.

## Context

Existing `/adv-review` Phase 7 builds an acceptance summary from delivered work, acceptance criteria, constraints, caveats, and investment metrics, then asks for acceptance. It currently has no explicit preview URL requirement for UI/browser-visible work.

## Discovery Agenda

- Confirm exact durable spec requirement location in `advance-workflow`.
- Inspect existing command/spec drift tests for required updates.
- Determine best phrasing for `Preview URL` unavailable fallback in acceptance output.
- Check whether any product-linked or cross-repo acceptance cases need target-repo preview URL wording.

## B/F/S Ambiguity Scan

- B: Scope includes `In Scope`, `Out of Scope`, and `Must Not` sections.
- F: Success criteria define observable acceptance output and fallback behavior.
- S: Completion signals are testable through command/spec contract and acceptance output shape.

No CRITICAL ambiguity findings.

## Discovery Findings

### Discovery Checklist

| Step | Result | Reason |
|---|---|---|
| Skills Considered | PASS | `adv-opportunity-scout` used through `adv-researcher`; no domain skill creation needed for internal workflow/spec update. |
| Extends | PASS | `docs/repo-improve-prep.md` cited; relevant new finding: latency pack is unrelated to preview URLs but reinforces deterministic workflow/state-machine direction. |
| Conflict Scan | PASS | `adv_change_list` showed no overlapping active preview-url change; `adv_change_validate` passed with expected pre-prep warnings `NO_TASKS` and `NO_DELTAS`; `adv_agenda_list` pending items are latency/cleanup bugs, not preview URL overlap. |
| Edge Cases | PASS | Edge cases listed below. |
| Design Question Depth | PASS | User-facing questions resolved via question tool; technical questions recorded as agent decisions. |
| Draft Spec Deltas | PASS | `rq-acceptancePreviewUrl01` draft shape below. |
| Related Pattern Scan | PASS | No existing `Preview URL` rule found. `acceptance summary` appears in `/adv-review`, `docs/adv-gates.md`, and changelog/executive-summary context only. |
| LBP Check | PASS | Internal workflow/spec change; no external solution check needed. Structural command/spec/test contract is the long-term best practice. |

### Skills Considered

- `adv-opportunity-scout`: matched discovery opportunity surface; loaded by researcher. Three candidates adopted or routed into agreement.
- No new skill created: domain is ADV workflow contract, already governed by project specs and command contracts.

### Extends

- `docs/repo-improve-prep.md`: unrelated latency research pack. New finding for this change: its deterministic orchestration guidance supports encoding preview URL behavior in spec/command/tests rather than relying on runtime memory.

### Conflict Scan

- Active changes: none directly overlap preview URL acceptance behavior.
- Agenda: pending items (`Fix incomplete active-change listing`, `Fix synthetic ADV residue cleanup`, `Fix OpenCode DB path resolution`, `Reduce poisoned workflow WIP noise`) do not overlap this rule.
- Validation: proposal passes; `NO_TASKS`/`NO_DELTAS` are expected before planning/spec delta materialization.

### Current State

- `.opencode/command/adv-review.md` Phase 7 builds acceptance summary with delivered work, acceptance criteria, constraints, caveats, and investment summary; no preview URL requirement exists.
- `.opencode/command/adv-review.md` already has pre-acceptance contract preflight and executive-summary persistence; preview URL evidence belongs before the Inline Approval prompt.
- `docs/adv-gates.md` Acceptance Gate docs mention review findings, AC checklist, generated `acceptance.md`, and `executive-summary.md`; no preview URL rule exists.
- `plugin/src/adv-skill-backed-commands-assets.test.ts` has asset tests for `/adv-review` pre-acceptance contract proof and generated acceptance projection; likely extension point for preview URL contract tests.

### Edge Cases

1. Front-end work changes visual output but no route is obvious from file paths.
   - Mitigation: require broad trigger definition (`Any visual output`) and let implementation define structural declaration/detection.
2. Dev server is down or not launchable in the current environment.
   - Mitigation: block acceptance for front-end work until URL + reachability evidence exists, unless scope is formally amended.
3. URL is present but stale/dead.
   - Mitigation: require reachability evidence with the URL.
4. Non-front-end workflow/doc-only change accidentally gets blocked.
   - Mitigation: allow `not_applicable` state for non-front-end work.

### Open Design Questions

- How to encode front-end applicability structurally?
  - Trust model: agent technical decision.
  - Blast radius: heuristic-only detection could overblock or underblock acceptance.
  - Alternatives: typed/declared applicability, file-pattern inference, manual checklist. Recommendation: structural declaration/checklist with deterministic fallback.
- How strong should preview proof be?
  - Trust model: user decision resolved.
  - Decision: URL + reachability evidence.
- What happens when URL is unavailable?
  - Trust model: user decision resolved.
  - Decision: block acceptance.
- What scope triggers the rule?
  - Trust model: user decision resolved.
  - Decision: any visual output.

### Draft Spec Deltas

- `rq-acceptancePreviewUrl01` — Front-end acceptance preview URL
  - Given a change whose delivered work affects front-end/browser-visible or visual output,
  - When `/adv-review` presents acceptance summary before user acceptance,
  - Then it includes a dev-environment Preview URL and reachability evidence.
  - Given no preview URL or reachability evidence is available for applicable work,
  - When `/adv-review` reaches acceptance checkpoint,
  - Then acceptance is blocked and the blocker is surfaced.
  - Given a change has no front-end/browser-visible or visual-output effect,
  - When `/adv-review` presents acceptance summary,
  - Then Preview URL may be marked `not_applicable` without blocking acceptance.

### Related Pattern Scan

- No existing preview URL acceptance rule found.
- Related acceptance-proof patterns exist in `/adv-review` contract review matrix and generated `acceptance.md` projection; preview URL should align with those proof patterns.

### LBP Check

- Recommended direction matches LBP: structural contract in spec + command + tests; no external library/service needed.
- Use tri-state preview status: `live`, `not_applicable`, `blocked`.
- Require reachability evidence, not a bare URL string.

### Discovery Opportunity Scout

- Auto-adopted: tri-state preview state; reachability evidence.
- Surfaced and resolved by user: preview evidence strength (`URL + reachability`), unavailable URL behavior (`Block acceptance`), trigger scope (`Any visual output`).
- Candidate for design: structural front-end applicability declaration/check, not heuristic-only sniffing.
- Candidate for design: persist preview proof into `executive-summary.md` when applicable.

### AMBIGUITY ANALYSIS — no blocking ambiguity findings. Coverage: B:C F:C S:C M:C

- B: clear scope boundaries in `## Scope`.
- F: clear functional requirements after user decisions.
- S: clear completion signals through command/spec/test behavior.
- M: user-facing unknowns resolved; technical encoding deferred to design.