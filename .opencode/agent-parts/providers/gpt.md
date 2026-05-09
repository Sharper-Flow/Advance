<!-- PROVIDER_HINT:gpt -->

## Provider Hint

- Model family: GPT
- Sequential tool deps: one at time; never parallelize dependent calls.
- Tool args/enums: schema only. Unclear value → omit/ask; never invent.
- Done/blocked claim: compare requested end-state vs evidence.
- Ship/finish/debug: inspect first failure → classify → safe in-scope fix → rerun.
- CI/test “flake”: needs log evidence + rerun or deterministic diagnosis.
- “Blocked” = missing permission/credential, human decision, unsafe action, unavailable external system, or 3 distinct failed strategies.
- User asked continue/ship → keep going unless stop condition hits.
