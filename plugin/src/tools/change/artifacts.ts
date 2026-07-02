/**
 * artifacts helpers extracted from change.ts.
 */
import { join } from "path";
import { readFile } from "fs/promises";
import {
  GATE_ORDER,
  ARTIFACT_FILENAME,
  type GateCompletion,
  type ArtifactKind,
  type Gates,
  type Change,
} from "../../types";
import type { Store } from "../../storage/store";
import { type ArtifactMetadata } from "../../temporal/contracts";
import { fileExists } from "../../storage/json";
import { findArchiveBundle } from "../../archive";
export async function normalizeArtifactMetadataForReadback(
  artifacts: Change["artifacts"],
): Promise<Change["artifacts"]> {
  if (!artifacts) return artifacts;
  const normalized: NonNullable<Change["artifacts"]> = {};
  for (const [kind, rawMetadata] of Object.entries(artifacts) as Array<
    [string, ArtifactMetadata]
  >) {
    const metadata: ArtifactMetadata = { ...rawMetadata };
    if (metadata.path) {
      // Readback re-validates paths because workflow state can retain legacy
      // path metadata after active artifacts moved to Temporal-only content.
      const readable =
        metadata.source !== "temporal" &&
        metadata.readable !== false &&
        (await fileExists(metadata.path));
      if (readable) {
        metadata.readable = true;
      } else {
        delete metadata.path;
        metadata.readable = false;
      }
    }
    normalized[kind as keyof NonNullable<Change["artifacts"]>] = metadata;
  }
  return normalized;
}
export async function normalizeGateArtifactEvidenceForReadback(
  gates: Gates | undefined,
): Promise<Gates | undefined> {
  if (!gates) return gates;
  const normalized = { ...gates } as Gates;
  for (const gateId of GATE_ORDER) {
    const gate = normalized[gateId];
    const evidence = gate?.artifact_evidence;
    if (!evidence?.path) continue;
    // Gate evidence may come from older state that recorded active artifact
    // paths; suppress phantom paths unless the file is still materialized.
    if (await fileExists(evidence.path)) continue;
    const { path: _path, ...evidenceWithoutPath } = evidence;
    normalized[gateId] = {
      ...gate,
      artifact_evidence: evidenceWithoutPath,
    } as GateCompletion;
  }
  return normalized;
}
/**
 * Read a single artifact content by canonical kind. Temporal-first per
 * KD-6: queries `state.documents[kind]` via `store.changes.get()` (which
 * uses `mapTemporalChangeStateToChange` to surface documents). Falls back
 * to disk-active-dir, then archive bundle.
 *
 * Returns `null` when content is unavailable from any source (e.g. an
 * in-flight pre-migration change whose `state.documents` is empty and
 * disk file is also empty).
 */
export async function readArtifact(
  store: Store,
  changeId: string,
  kind: ArtifactKind,
): Promise<string | null> {
  // 1. Temporal-first — query workflow state.documents.
  try {
    const result = await store.changes.get(changeId);
    if (result.success && result.data) {
      const content = result.data.documents?.[kind];
      if (typeof content === "string" && content.length > 0) return content;
    }
  } catch {
    // Workflow may be unavailable; fall through to disk.
  }
  // 2. Disk active directory.
  const changeDir = join(store.paths.changes, changeId);
  const filename = ARTIFACT_FILENAME[kind];
  try {
    const text = await readFile(join(changeDir, filename), "utf-8");
    if (text.trim().length > 0) return text;
  } catch {
    // File missing — fall through.
  }
  // 3. Archive bundle fallback.
  const archiveDir = join(store.paths.root, ".adv", "archive");
  const bundleDir = await findArchiveBundle(archiveDir, changeId);
  if (bundleDir) {
    try {
      const text = await readFile(join(bundleDir, filename), "utf-8");
      if (text.trim().length > 0) return text;
    } catch {
      // Bundle file missing — return null.
    }
  }
  return null;
}
/**
 * Load proposal content with the legacy scaffold-fallback semantics layered
 * over the new Temporal-first read path. Returns generated scaffold text
 * when no proposal content is available from any source — matches the
 * pre-migration `loadProposalWithFallback` contract that downstream callers
 * (clarify-readiness checks, snapshot rendering, context fetching) rely on.
 *
 * T10 migration target — replaces direct `loadProposalWithFallback` calls.
 */
export async function loadProposalForContext(
  store: Store,
  changeId: string,
  changeTitle: string,
): Promise<{
  content: string;
  warning?: string;
}> {
  const content = await readArtifact(store, changeId, "proposal");
  if (content !== null) return { content };
  // Scaffold fallback — mirrors storage/json.ts loadProposalWithFallback's
  // scaffold so downstream consumers always receive some structural text.
  const scaffold = `# ${changeTitle}

## Intent

<!-- Auto-generated scaffold: proposal.md was missing or empty. -->
<!-- Update this file with the actual intent, scope, and user outcomes. -->

## Scope

- (unknown — proposal.md not found)

## User Outcomes

- [ ] Users can see what outcome this change is meant to deliver
- [ ] Discovery firms acceptance criteria and success criteria downstream
`;
  return {
    content: scaffold,
    warning: `⚠️  proposal content not found in Temporal state.documents or disk for change ${changeId}. Using auto-generated scaffold. Run /adv-proposal to create a proper proposal.`,
  };
}
/**
 * Batched multi-artifact read. Per C9 (read latency), issues exactly ONE
 * workflow query and extracts the requested kinds in memory. Disk and
 * archive-bundle fallbacks are per-kind in case the workflow lacks content
 * for some kinds (pre-migration change, partial hydration).
 *
 * Returns a partial record keyed by requested kind; missing kinds are
 * absent from the returned object.
 */
export async function readArtifacts(
  store: Store,
  changeId: string,
  kinds: ArtifactKind[],
): Promise<Partial<Record<ArtifactKind, string>>> {
  const result: Partial<Record<ArtifactKind, string>> = {};
  // 1. Temporal-first — single store.changes.get() call covers all kinds.
  let temporalDocuments: Partial<Record<ArtifactKind, string>> | undefined;
  try {
    const changeResult = await store.changes.get(changeId);
    if (changeResult.success && changeResult.data) {
      temporalDocuments = changeResult.data.documents as
        | Partial<Record<ArtifactKind, string>>
        | undefined;
    }
  } catch {
    // Workflow may be unavailable; per-kind disk fallback follows.
  }
  // 2. Per-kind: prefer Temporal, fall back to disk/archive.
  for (const kind of kinds) {
    const temporalContent = temporalDocuments?.[kind];
    if (typeof temporalContent === "string" && temporalContent.length > 0) {
      result[kind] = temporalContent;
      continue;
    }
    // Disk fallback per kind.
    const changeDir = join(store.paths.changes, changeId);
    const filename = ARTIFACT_FILENAME[kind];
    try {
      const text = await readFile(join(changeDir, filename), "utf-8");
      if (text.trim().length > 0) {
        result[kind] = text;
        continue;
      }
    } catch {
      // Fall through to archive bundle.
    }
    const archiveDir = join(store.paths.root, ".adv", "archive");
    const bundleDir = await findArchiveBundle(archiveDir, changeId);
    if (bundleDir) {
      try {
        const text = await readFile(join(bundleDir, filename), "utf-8");
        if (text.trim().length > 0) result[kind] = text;
      } catch {
        // Skip missing artifact.
      }
    }
  }
  return result;
}
