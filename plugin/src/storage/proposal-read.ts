/**
 * Projection-first proposal read for context rendering (KD5).
 *
 * The durable projection (`change.documents.proposal`) is the live authority
 * for proposal content. Disk `proposal.md` and the archive bundle are
 * read-only legacy fallbacks that keep pre-cutover and archived changes
 * renderable (C3); the scaffold is the last resort so callers always receive
 * some structural text.
 *
 * Lives in the storage layer so `context-snapshot-fetch` can read the
 * projection without importing from `tools/` (layering invariant).
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Store } from "./store";
import type { Change } from "../types";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("proposal-read");

export interface ProposalReadResult {
  content: string;
  warning?: string;
}

function buildProposalScaffold(changeTitle: string): string {
  return `# ${changeTitle}

## Intent

<!-- Auto-generated scaffold: proposal content was missing or empty. -->
<!-- Update the proposal with the actual intent, scope, and user outcomes. -->

## Scope

- (unknown — no proposal content found)

## User Outcomes

- [ ] Users can see what outcome this change is meant to deliver
- [ ] Discovery firms acceptance criteria and success criteria downstream
`;
}

async function readNonEmptyFile(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return raw.trim().length > 0 ? raw : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Unexpected error reading ${path}: ${(err as Error).message}`,
      );
    }
    return null;
  }
}

export async function loadProposalForSnapshot(
  store: Store,
  change: Change,
): Promise<ProposalReadResult> {
  // 1. Durable projection — the live authority.
  const persisted = change.documents?.proposal;
  if (typeof persisted === "string" && persisted.trim().length > 0) {
    return { content: persisted };
  }

  // 2. Legacy active-dir disk fallback (pre-cutover changes only).
  const diskContent = await readNonEmptyFile(
    join(store.paths.changes, change.id, "proposal.md"),
  );
  if (diskContent) return { content: diskContent };

  // 3. Archive-bundle fallback — archived changes have no active dir.
  try {
    const { findArchiveBundle } = await import("../archive/archive");
    const bundleDir = await findArchiveBundle(
      join(store.paths.root, ".adv", "archive"),
      change.id,
    );
    if (bundleDir) {
      const bundleContent = await readNonEmptyFile(
        join(bundleDir, "proposal.md"),
      );
      if (bundleContent) return { content: bundleContent };
    }
  } catch {
    // Archive missing or unreadable — fall through to scaffold.
  }

  return {
    content: buildProposalScaffold(change.title),
    warning: `⚠️  No proposal content found in the projection, active directory, or archive for change ${change.id}. Using auto-generated scaffold. Run /adv-proposal to create a proper proposal.`,
  };
}
