# adv-triage Match Algorithm

## Match algorithm

Structural first, heuristic last:

1. **Stable ref match** — issue body contains source `ref` (`wisdom-id`, `tk-...`, `file:line`, `change-id`). Exact evidence → represented.
2. **Body excerpt match** — first 80 chars of source body, lowercased/normalized, appears verbatim in open issue body. Exact evidence → represented.
3. **Title similarity** — Jaccard similarity of normalized title tokens ≥ `0.6`. Heuristic only → candidate duplicate, not represented.

Title normalization: lowercase, trim, collapse whitespace, strip punctuation, drop stopwords (`a`, `the`, `and`, `or`, `for`, `to`, `of`, `in`).

Only ref/body matches may auto-suppress issue creation. Title similarity stays in user-confirmation list with candidate issue number.