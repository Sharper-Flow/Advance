# Executive Summary

`/adv-triage` now requires relevance validation before asking the user for bug Priority or feature Value. Field-gap candidates must be checked against issue evidence, linked ADV change state, and current source/docs/tests when applicable; stale, already-addressed, duplicate, or unclear items are resolved before scoring prompts.

The command contract, triage skill prompts, and anti-pattern guidance were updated. A new asset test locks the relevance-validation-before-field-assignment requirement and verifies the documented outcomes. Targeted verification passed via `bin/oc-test targeted -- src/adv-triage-relevance-assets.test.ts`.