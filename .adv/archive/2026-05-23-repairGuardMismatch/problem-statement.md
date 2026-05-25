# Problem Statement

ADV needs spec-aligned, structurally enforced worktree isolation with accurate remediation and trustworthy registry reads, without weakening isolation for code/git-mutating gates.

Current behavior blocks metadata-only discovery/design gate completion from main checkout, while code/git-mutating gates and task execution still require strict worktree isolation. Current remediation can point agents at unsupported invocation surfaces, and registry consumers can still depend on retired/stubbed read paths that produce false empty-state guidance.