# Discovery Agreement

## Facts

- Issue #92 reports `adv_status` doctor wording frames blank assistant messages as stale even when they may belong to live sessions.
- Issue #91 owns deeper orphan-vs-live classification.
- Status output should be safety-preserving and not imply deletion without proof.

## Decisions

- Reframe wording around active-session debt vs repairable/orphan rows.
- Align with #91 bucket language where available.
- Keep cleanup/delete recommendations approval-gated.

## Risks / Unknowns

- #91 may change underlying classification fields; this change should compose with it.
- Status output tests may assert exact strings.

## Out of Scope

- Implementing full doctor deletion classification if handled by #91.
- Direct state cleanup.