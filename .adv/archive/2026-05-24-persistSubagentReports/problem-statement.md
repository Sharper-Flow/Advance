# Problem Statement — persistSubagentReports

ADV delegates implementation and review work to sub-agents, but their structured reports were delivered as fenced JSON in final prose. That made durable workflow state depend on message delivery and text extraction.

If a sub-agent completed work but its final response was aborted, truncated, malformed, or drifted from the expected fence shape, ADV could lose blocker, follow-up, verification, and implementation evidence. The correct source of truth should be ADV state, not chat transcript parsing.

This change makes sub-agent reports typed, validated, persisted, and queryable through ADV tools.