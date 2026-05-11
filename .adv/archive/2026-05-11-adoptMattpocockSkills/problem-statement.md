# Problem Statement

ADV has 15 adv-* skills plus ~10 supporting skills under `~/.config/opencode/skills/`. Several are prose-heavy: adv-triage is 638 lines, adv-ci-release 388, adv-slop-detection 230, adv-audit 189, adv-reflect 181, adv-improve 181, adv-backend-stack-eval 199. No standardized authoring conventions exist.

The agent lacks dedicated skills for:
- Sharpening domain language during clarification (domain glossary as token-efficiency lever)
- Zooming out to system-level context when reading unfamiliar code
- Building disposable prototypes to flush out design decisions before committing
- Authoring new skills with consistent structure

Pocock's `mattpocock/skills` (71k stars, Nov 2025) demonstrates these patterns at scale with concrete artifacts (`CONTEXT.md` domain glossary, `docs/adr/NNNN-*.md` Architecture Decision Records) and a progressive-disclosure SKILL.md style (`<what-to-do>` / `<supporting-info>` two-section split, supporting reference docs offloaded).

Adopting Pocock's library wholesale conflicts with ADV — Pocock's README explicitly rejects gate-machine frameworks (GSD/BMAD/Spec-Kit) for "owning the process." Several Pocock skills duplicate ADV-gate-bound surfaces: `grill-me` overlaps `/adv-clarify`, `to-prd` overlaps `/adv-proposal`, `triage` overlaps `/adv-triage`, `tdd` overlaps the RSTC protocol. Two competing process layers create agent-selection ambiguity and bypassable gates.

The path forward is selective: cherry-pick standalone-utility skills, adopt the authoring conventions + domain artifacts that compose orthogonally with ADV gates, and explicitly exclude overlap skills.