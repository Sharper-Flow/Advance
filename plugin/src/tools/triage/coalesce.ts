export type CoalesceTier = "structural" | "heuristic";

export interface CoalesceChange {
  id: string;
  title: string;
  proposalBody: string;
  problemStatement: string;
  linkedIssueNumbers: number[];
  epicMemberIssueNumbers: number[];
}

export interface CoalesceIssue {
  number: number;
  title: string;
  body: string;
}

export interface CoalescePair {
  changeId: string;
  issueNumber: number;
  tier: CoalesceTier;
  evidence: string;
  score?: number;
}

export interface CoalesceInput {
  activeChanges: CoalesceChange[];
  openIssues: CoalesceIssue[];
}

const TOKEN_RE = /[a-z0-9]+/g;

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(TOKEN_RE) ?? []);
}

function jaccard(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function hasStableIssueRef(text: string, issueNumber: number): boolean {
  const escaped = String(issueNumber).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:#|issues/)${escaped}\\b`, "i").test(text);
}

function normalizeExcerpt(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function exactDistinctiveExcerpt(
  changeText: string,
  issueBody: string,
): boolean {
  const body = normalizeExcerpt(issueBody);
  const change = normalizeExcerpt(changeText);
  return body.length >= 20 && change.includes(body);
}

export function classifyCoalescePairs(input: CoalesceInput): CoalescePair[] {
  const pairs: CoalescePair[] = [];

  for (const change of input.activeChanges) {
    const alreadyLinked = new Set([
      ...change.linkedIssueNumbers,
      ...change.epicMemberIssueNumbers,
    ]);
    const changeText = [change.proposalBody, change.problemStatement]
      .filter(Boolean)
      .join("\n");

    for (const issue of input.openIssues) {
      if (alreadyLinked.has(issue.number)) continue;

      if (hasStableIssueRef(changeText, issue.number)) {
        pairs.push({
          changeId: change.id,
          issueNumber: issue.number,
          tier: "structural",
          evidence: `stable issue reference #${issue.number}`,
        });
        continue;
      }

      if (exactDistinctiveExcerpt(changeText, issue.body)) {
        pairs.push({
          changeId: change.id,
          issueNumber: issue.number,
          tier: "structural",
          evidence: "exact distinctive issue-body excerpt",
        });
        continue;
      }

      const score = jaccard(change.title, issue.title);
      if (score >= 0.7) {
        pairs.push({
          changeId: change.id,
          issueNumber: issue.number,
          tier: "heuristic",
          score,
          evidence: `title token similarity ${score.toFixed(2)}`,
        });
      }
    }
  }

  return pairs;
}

export type CoalesceApproval =
  | { kind: "approve_all" }
  | { kind: "reject_all" }
  | { kind: "link"; indices: number[] }
  | { kind: "skip"; indices: number[] }
  | { kind: "stop" }
  | { kind: "unparsed"; raw: string };

export function parseCoalesceApproval(
  input: string,
  displayedCount: number,
): CoalesceApproval {
  const normalized = input.trim().toLowerCase();
  if (normalized === "approve all") return { kind: "approve_all" };
  if (normalized === "reject all") return { kind: "reject_all" };
  if (normalized === "stop" || normalized === "abort") {
    return { kind: "stop" };
  }

  const selective = /^(link|skip)\s+(\d+(?:\s*,\s*\d+)*)$/.exec(normalized);
  if (!selective) return { kind: "unparsed", raw: input };

  const indices = [...new Set(selective[2].split(",").map(Number))].sort(
    (left, right) => left - right,
  );
  if (
    indices.length === 0 ||
    indices.some((index) => index < 1 || index > displayedCount)
  ) {
    return { kind: "unparsed", raw: input };
  }

  return selective[1] === "link"
    ? { kind: "link", indices }
    : { kind: "skip", indices };
}
