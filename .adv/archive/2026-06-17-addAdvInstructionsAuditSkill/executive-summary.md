# Executive Summary

Shipped `skills/adv-instructions-audit/SKILL.md` — a read-only methodology that audits Advance's instruction prose against its executable anchors (the ~47 `*-assets.test.ts` / invariant / drift test files). The skill is the meta-layer that makes Advance's existing ad-hoc anchor layer systematic and discoverable; it adds no enforcement and occupies a distinct axis from `adv-audit` (instruction-prose↔anchor vs spec↔code).

**Core rules:** trace-to-anchor *with fidelity* (an anchor must fail for the claim's specific failure mode — presence alone is a false anchor), test-or-cut, single-source-per-surface, runtime-assembly-aware. **Five dimensions:** anchor mapper, drift detector (fidelity), coverage checker, duplication detector, orphan detector.

**Validated outcome (dry-run):** applied to `project.md`, `AGENTS.md`, and one `ADV_INSTRUCTIONS.md` section. Produced 5 findings (2 HIGH, 3 MEDIUM), health MAJOR_DRIFT. All three positive controls fired — most importantly, the methodology **reproduced the exact bug class that broke CI in PR #172**: a presence-only anchor (the canonical CI-order string) passed while the per-command dev-comments drifted from `package.json`. The fidelity rule is what made that surface; without it, the two HIGH findings would be falsely rated "anchored."

**Verification:** 63 governing skill tests pass (loading-policy, skill-backed-commands, repo-instructions-assets); git diff vs trunk is exactly one file; no command/tool/scanner added; AC6 live-load deferred to deploy+restart per the source-vs-dist gotcha.

**Follow-ups (out of scope):** (1) fix project.md dev-commands + drop the stale "21" count; (2) add a drift-guard tying dev-command comments to package.json (closes the class that bit PR #172); (3) extend the coverage doc beyond runtime adv.md. Bonus: deploy --check surfaced a pre-existing `adv_change_forget` tool-drift the methodology would also catch.

**Outcome:** the skill earns its keep — it turned a reactive, mid-PR drift failure into a minutes-long, structured audit with actionable findings and a correct root-cause diagnosis.