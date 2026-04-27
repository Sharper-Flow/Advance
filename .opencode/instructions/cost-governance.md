---
# Cost / Time Investment Governance (ADV v1 — behavioral-only)
#
# Conservative default thresholds. Task/retry dimensions hitting a tier promote
# the whole report to that tier (MAX rule). `elapsed_minutes` is retained for
# reporting/config compatibility but is informational only; elapsed time no
# longer participates in tier classification. Tunable without code changes —
# edit these values and restart OpenCode. The `adv_investment_report` tool
# reads thresholds from command arguments and falls back to these defaults
# when no override is provided.
thresholds:
  auto:
    tasks: 3
    retries: 0
    elapsed_minutes: 15
  escalate:
    tasks: 8
    retries: 2
    elapsed_minutes: 60
  hardstop:
    tasks: 15
    retries: 5
    elapsed_minutes: 180

# In-scope judgment categories for v1. Only these categories warrant
# surfacing upcoming decisions to the user during /adv-apply Phase 1.5.
# Out-of-scope (agent resolves autonomously to avoid decision fatigue):
# defaults, naming, error_semantics.
in_scope_categories:
  - non_functional_tradeoff
  - extensibility
  - scope_boundary

# Applies to ADV workflows only. Non-ADV agents (build, general,
# librarian, etc.) read this file but the governance does not apply to
# their work. ADV owns the plugin tool backing that makes judgment-call
# surfacing possible.
scope: adv_only
---

# Investment Check-In Governance

**Purpose:** judgment-surfacing governance — **not** a budget gate. When an
ADV change reaches `/adv-apply`, the agent surfaces upcoming decisions that
need user intuition/preference/context (not ones the agent can resolve
autonomously). Established scope is assumed yes; this is about *how* to
proceed on decisions the agent would otherwise make silently.

**Scope:** ADV workflows only. Non-ADV agents (build, general, etc.)
read this file but do not apply the governance.

## Methodology

The full protocol, category definitions, cadence rules, composition with
doom-loop / cancellation / re-entry / TDD reclassification, hard-stop
advisory semantics, and the `rq-autonomy01` escape-clause citation live in:

**`skills/adv-cost-governance-methodology/SKILL.md`**

Agents load the skill via `skill("adv-cost-governance-methodology")` and
apply the Identification Protocol (in `/adv-prep` Phase J) or the Surfacing
Protocol (in `/adv-apply` Phase 1.5). This instruction file owns **tunable
config only** (the YAML frontmatter above); the skill owns methodology.

## Tuning Thresholds

Edit the YAML frontmatter above. Restart OpenCode (or the agent session) for
changes to take effect. The agent reads thresholds from this file at session
start and passes them to `adv_investment_report` as the `thresholds` argument.

**Note:** in v1, `escalate` and `hardstop` bands drive tier changes. Anything
below `escalate` resolves to `auto`. The `auto` band is retained in config for
user-facing guidance and future expansion, but changing `auto.*` alone does not
change tier classification semantics.

| Want | Action |
|---|---|
| Fewer interruptions | Raise `escalate.tasks` and/or `escalate.retries`. Keep `hardstop` as a safety valve. |
| Earlier check-ins | Lower `escalate.tasks` and/or `escalate.retries`. |
| Never missed high-investment runs | Lower `hardstop.tasks` and/or `hardstop.retries` — they are the safety ceiling. |

## References

- `ADV_INSTRUCTIONS.md § Investment Check-In` — thin subsection naming this skill
- `rules.yaml` P28 — cost-governance rule (user-managed; see `SETUP.md`)
- `plugin/src/tools/investment.ts` — the `adv_investment_report` tool
- `skills/adv-cost-governance-methodology/SKILL.md` — canonical methodology
