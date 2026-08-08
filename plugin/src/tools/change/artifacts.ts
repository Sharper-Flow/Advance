/**
 * artifacts helpers extracted from change.ts.
 */
import { join } from "path";
import { createHash } from "node:crypto";
import {
  GATE_ORDER,
  ARTIFACT_FILENAME,
  type ArtifactMetadata,
  type GateCompletion,
  type ArtifactKind,
  type Gates,
  type Change,
} from "../../types";
import type { Store } from "../../storage/store";
import { fileExists } from "../../storage/json";
import { findArchiveBundle } from "../../archive/archive";
import {
  readBoundedProjectionDocument,
  type LoadResult,
} from "../../storage/change-projection-reader";
import { createLogger } from "../../utils/debug-log";
const logger = createLogger("change-artifacts");

type ArtifactReadSource = Extract<
  NonNullable<LoadResult<unknown>["source"]>,
  "workflow" | "disk" | "archive" | "active_projection"
>;

export interface ArtifactReadResult {
  content: string;
  source: ArtifactReadSource;
}

async function readArtifactFile(filePath: string): Promise<string | null> {
  const result = await readBoundedProjectionDocument(filePath);
  if (result.kind === "ok") return result.content;
  if (result.kind !== "not_found") {
    logger.warn(
      `Artifact read bounded failure at ${filePath}: ${result.kind}${result.kind === "oversized" ? ` (${result.actual} > ${result.limit} bytes)` : ""}`,
    );
  }
  return null;
}

async function readProjectionDocuments(
  changesDir: string,
  changeId: string,
): Promise<Partial<Record<ArtifactKind, string>>> {
  // Canonical projection lives at {changesDir}/{changeId}/change.json and the
  // flat {changeId}.json envelope is a legacy read-only fallback. Previously
  // this read ONLY the flat path, which never exists for canonical-layout
  // changes — so the projection-first read always missed and fell through to
  // disk. That silent miss is the root cause of #403 (update-written artifacts
  // unreadable from the projection).
  const candidates = [
    join(changesDir, changeId, "change.json"),
    join(changesDir, `${changeId}.json`),
  ];
  let parsed: unknown = null;
  for (const projectionPath of candidates) {
    const result = await readBoundedProjectionDocument(projectionPath);
    if (result.kind !== "ok") continue;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) break;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const state = (parsed as { state?: unknown }).state;
  const projection =
    state && typeof state === "object" && !Array.isArray(state)
      ? state
      : parsed;
  const documents = (projection as { documents?: unknown }).documents;
  if (!documents || typeof documents !== "object" || Array.isArray(documents)) {
    return {};
  }
  return documents as Partial<Record<ArtifactKind, string>>;
}

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
      // Readback re-validates paths because persisted state can retain legacy
      // path metadata after active artifacts moved to content-only storage.
      const readable =
        metadata.readable !== false &&
        !metadata.rejection &&
        (await fileExists(metadata.path));
      if (readable && metadata.source === "temporal") {
        metadata.source = "disk";
        metadata.readable = true;
      } else {
        if (!readable) {
          delete metadata.path;
          metadata.readable = false;
        }
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
 * Read a single artifact content by canonical kind from the disk projection,
 * then the active artifact directory, then the archive bundle.
 *
 * Returns `null` when content is unavailable from any source (e.g. an
 * in-flight pre-migration change whose `state.documents` is empty and
 * disk file is also empty).
 */
export async function readArtifact(
  store: Store,
  changeId: string,
  kind: ArtifactKind,
): Promise<ArtifactReadResult | null> {
  // 1. Durable active projection.
  const projectionDocuments = await readProjectionDocuments(
    store.paths.changes,
    changeId,
  );
  const projectionContent = projectionDocuments[kind];
  if (typeof projectionContent === "string" && projectionContent.length > 0) {
    return { content: projectionContent, source: "active_projection" };
  }

  // 2. Disk active directory.
  const changeDir = join(store.paths.changes, changeId);
  const filename = ARTIFACT_FILENAME[kind];
  try {
    const text = await readArtifactFile(join(changeDir, filename));
    if (text && text.trim().length > 0) {
      return { content: text, source: "disk" };
    }
  } catch {
    // File missing — fall through.
  }
  // 3. Archive bundle fallback.
  const archiveDir = join(store.paths.root, ".adv", "archive");
  const bundleDir = await findArchiveBundle(archiveDir, changeId);
  if (bundleDir) {
    try {
      const text = await readArtifactFile(join(bundleDir, filename));
      if (text && text.trim().length > 0) {
        return { content: text, source: "archive" };
      }
    } catch {
      // Bundle file missing — return null.
    }
  }
  return null;
}
export interface InspectedArtifact {
  kind: ArtifactKind;
  source: ArtifactReadSource;
  contentHash: string;
  nonWhitespaceChars: number;
  checkedAt: string;
}

/**
 * Content-integrity inspection over the artifact-authority chain.
 *
 * Replaces the active-directory `.md` round-trip that recovery paths used to
 * perform: content now comes from `readArtifact` (projection → disk → archive
 * bundle) and the hash is computed from that content. Returns `null` when no
 * source carries the artifact.
 */
export async function inspectArtifactContent(
  store: Store,
  changeId: string,
  kind: ArtifactKind,
): Promise<InspectedArtifact | null> {
  const artifact = await readArtifact(store, changeId, kind);
  if (artifact === null) return null;
  return {
    kind,
    source: artifact.source,
    contentHash: createHash("sha256").update(artifact.content).digest("hex"),
    nonWhitespaceChars: artifact.content.replace(/\s/g, "").length,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Load proposal content with the legacy scaffold-fallback semantics layered
 * over the persisted-projection-first read path. Returns generated scaffold text
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
  const artifact = await readArtifact(store, changeId, "proposal");
  if (artifact !== null) return { content: artifact.content };
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
    warning: `⚠️  proposal content not found in persisted documents or disk for change ${changeId}. Using auto-generated scaffold. Run /adv-proposal to create a proper proposal.`,
  };
}
/**
 * Batched multi-artifact read from the durable projection with per-kind disk
 * and archive-bundle fallbacks.
 *
 * Returns a partial record keyed by requested kind; missing kinds are
 * absent from the returned object.
 */
export async function readArtifacts(
  store: Store,
  changeId: string,
  kinds: ArtifactKind[],
): Promise<Partial<Record<ArtifactKind, ArtifactReadResult>>> {
  const result: Partial<Record<ArtifactKind, ArtifactReadResult>> = {};
  // 1. Read the durable projection once.
  const projectionDocuments = await readProjectionDocuments(
    store.paths.changes,
    changeId,
  );

  // 2. Per-kind: prefer projection, disk, and archive.
  for (const kind of kinds) {
    const projectionContent = projectionDocuments[kind];
    if (typeof projectionContent === "string" && projectionContent.length > 0) {
      result[kind] = {
        content: projectionContent,
        source: "active_projection",
      };
      continue;
    }
    // Disk fallback per kind.
    const changeDir = join(store.paths.changes, changeId);
    const filename = ARTIFACT_FILENAME[kind];
    try {
      const text = await readArtifactFile(join(changeDir, filename));
      if (text && text.trim().length > 0) {
        result[kind] = { content: text, source: "disk" };
        continue;
      }
    } catch {
      // Fall through to archive bundle.
    }
    const archiveDir = join(store.paths.root, ".adv", "archive");
    const bundleDir = await findArchiveBundle(archiveDir, changeId);
    if (bundleDir) {
      try {
        const text = await readArtifactFile(join(bundleDir, filename));
        if (text && text.trim().length > 0) {
          result[kind] = { content: text, source: "archive" };
        }
      } catch {
        // Skip missing artifact.
      }
    }
  }
  return result;
}
