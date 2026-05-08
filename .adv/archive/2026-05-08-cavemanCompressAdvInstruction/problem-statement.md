# Problem Statement

`ADV_INSTRUCTIONS.md` carries heavy prose load and has already approached/exceeded the line-budget guard used by asset tests. Existing command voice docs describe terse runtime voice and generic prose-load reduction, but do not explicitly define how terse/caveman-lite style composes with the prose-load templates for agent-facing instruction docs.

Need compress instructions enough to reduce context pressure while preserving exact operational contracts: gates, tool names, commands, statuses, `MUST`/`NEVER`, approval checkpoints, cancellation/archive safety, and verification obligations.