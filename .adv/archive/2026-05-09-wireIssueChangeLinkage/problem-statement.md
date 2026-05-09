Schema for issue↔change linkage exists (`change.origin` typed field, `adv_roadmap` cross-reference, architecture decision in `ADV_INSTRUCTIONS.md`). Behavior automation does not.

Without it the agent manually passes origin args on every create, manually fetches GH issue bodies for prefill, manually closes linked issues on archive. The read-side cross-reference (active-change annotation) is the only piece already wired.

This change closes the gap with: `/adv-proposal #N` body prefill (consuming the sanitizer contract from `enforcescoreblindproposaldesig`), opt-in archive auto-close, `/adv-triage` triage-origin tagging, and `/adv-roadmap` recommendation surface. It also migrates `github_project` config off `project_metadata` (which has a 200-char summary limit unfit for typed config blobs) into a dedicated typed config file. Coordinates with `enforcescoreblindproposaldesig` for the sanitizer contract.</problemStatement>
</invoke>