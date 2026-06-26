# Executive Summary

Updated the local ADV dashboard cards so in-progress changes no longer show noisy `Status: draft` lifecycle text. ADV status cards now show the existing next-gate badge plus `Gate progress`, derived from already-plumbed gate data.

Cards inside each lane now sort by completed gate count descending, then by last activity, title, and change id for deterministic ordering. This puts the most-complete changes first without relying on Temporal lifecycle status.

Unmatched source semantics remain unchanged: GitHub PR/workflow/deployment items without structural ADV correlation stay in the secondary `unmatched_source` lane, which covers one-off or small-fix source activity that has no ADV change match.

Verification: RED `tr_mqv90qsc_23a4c171`; GREEN `tr_mqv9321x_efe255b8`; dashboard suite `tr_mqv9668v_e9fc46a2` (41 tests, 192 assertions); reviewer suite `tr_mqv9at47_0137ffb4` (22 tests, 124 assertions); reviewer verdict READY.