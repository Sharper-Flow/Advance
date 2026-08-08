import { join } from "node:path";
import { SpecSchema } from "../types";
import {
  PROJECTION_DOCUMENT_BYTE_LIMIT,
  readBoundedProjectionDocument,
} from "../storage/change-projection-reader";
import {
  ArchiveProjectionProofReceiptSchema,
  type ArchiveProjectionProofReceipt,
} from "../types/archive-projection";
import { spawnGitStreams, spawnSyncGit } from "../utils/git-binary";
import {
  SpecProjectionManifestSchema,
  canonicalSha256,
  requirementSha256,
  specSha256,
  type SpecProjectionManifest,
} from "./projection";

export type ProjectionProofFailureCode =
  | "MANIFEST_UNREADABLE"
  | "MANIFEST_MISMATCH"
  | "SPEC_UNREADABLE"
  | "SPEC_MISMATCH"
  | "VERSION_MISMATCH"
  | "REQUIREMENT_MISMATCH"
  | "DOCUMENT_UNREADABLE"
  | "DOCUMENT_MISMATCH";

export type ProjectionProofResult =
  | { ok: true; receipt: ArchiveProjectionProofReceipt }
  | {
      ok: false;
      code: ProjectionProofFailureCode;
      capability?: string;
      message: string;
    };

interface ProjectionContentReader {
  readSpec(capability: string): Promise<string>;
  readDocument(capability: string): Promise<string>;
}

export async function readProjectionManifest(
  bundlePath: string,
): Promise<SpecProjectionManifest | null> {
  const result = await readBoundedProjectionDocument(
    join(bundlePath, "spec-projection.json"),
  );
  if (result.kind !== "ok") return null;
  try {
    const parsed = SpecProjectionManifestSchema.safeParse(
      JSON.parse(result.content),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function verifyProjection(
  manifestInput: SpecProjectionManifest,
  releasedCommitSha: string,
  expectedChangeId: string,
  expectedDeltaSetSha256: string,
  expectedDeltaIdsByCapability: Record<string, string[]>,
  reader: ProjectionContentReader,
): Promise<ProjectionProofResult> {
  const parsedManifest = SpecProjectionManifestSchema.safeParse(manifestInput);
  if (!parsedManifest.success) {
    return {
      ok: false,
      code: "MANIFEST_UNREADABLE",
      message: "Projection manifest failed strict schema validation",
    };
  }
  const manifest = parsedManifest.data;
  if (
    manifest.change_id !== expectedChangeId ||
    manifest.delta_set_sha256 !== expectedDeltaSetSha256
  ) {
    return {
      ok: false,
      code: "MANIFEST_MISMATCH",
      message: "Projection manifest is not bound to the archived change deltas",
    };
  }
  const expectedCapabilities = Object.entries(expectedDeltaIdsByCapability)
    .filter(([, deltaIds]) => deltaIds.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const manifestCapabilities = [...manifest.capabilities].sort((left, right) =>
    left.capability.localeCompare(right.capability),
  );
  if (
    manifestCapabilities.length !== expectedCapabilities.length ||
    manifestCapabilities.some(
      (capability, index) =>
        capability.capability !== expectedCapabilities[index]?.[0],
    )
  ) {
    return {
      ok: false,
      code: "MANIFEST_MISMATCH",
      message:
        "Projection manifest capability set does not match accepted deltas",
    };
  }
  for (const [capability, expectedDeltaIds] of expectedCapabilities) {
    const manifestCapability = manifestCapabilities.find(
      (entry) => entry.capability === capability,
    );
    const actualDeltaIds = [
      ...new Set(
        manifestCapability?.dispositions.map((entry) => entry.deltaId) ?? [],
      ),
    ].sort((left, right) => left.localeCompare(right));
    const expectedIds = [...new Set(expectedDeltaIds)].sort((left, right) =>
      left.localeCompare(right),
    );
    if (
      actualDeltaIds.length !== expectedIds.length ||
      actualDeltaIds.some((deltaId, index) => deltaId !== expectedIds[index])
    ) {
      return {
        ok: false,
        code: "MANIFEST_MISMATCH",
        capability,
        message:
          "Projection manifest does not account for every accepted delta",
      };
    }
  }
  for (const capability of manifest.capabilities) {
    let specText: string;
    try {
      specText = await reader.readSpec(capability.capability);
    } catch (error) {
      return {
        ok: false,
        code: "SPEC_UNREADABLE",
        capability: capability.capability,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    let specInput: unknown;
    try {
      specInput = JSON.parse(specText);
    } catch {
      return {
        ok: false,
        code: "SPEC_UNREADABLE",
        capability: capability.capability,
        message: "Released spec is not valid JSON",
      };
    }
    const spec = SpecSchema.safeParse(specInput);
    if (!spec.success) {
      return {
        ok: false,
        code: "SPEC_UNREADABLE",
        capability: capability.capability,
        message: "Released spec failed schema validation",
      };
    }
    if (spec.data.version !== capability.target_version) {
      return {
        ok: false,
        code: "VERSION_MISMATCH",
        capability: capability.capability,
        message: `${spec.data.version} != ${capability.target_version}`,
      };
    }
    if (specSha256(spec.data) !== capability.spec_sha256) {
      return {
        ok: false,
        code: "SPEC_MISMATCH",
        capability: capability.capability,
        message: "Released spec digest differs from projection manifest",
      };
    }
    for (const [requirementId, expectedDigest] of Object.entries(
      capability.requirement_sha256,
    )) {
      const requirement = spec.data.requirements.find(
        (row) => row.id === requirementId,
      );
      if (!requirement || requirementSha256(requirement) !== expectedDigest) {
        return {
          ok: false,
          code: "REQUIREMENT_MISMATCH",
          capability: capability.capability,
          message: `Requirement ${requirementId} differs from projection manifest`,
        };
      }
    }
    let document: string;
    try {
      document = await reader.readDocument(capability.capability);
    } catch (error) {
      return {
        ok: false,
        code: "DOCUMENT_UNREADABLE",
        capability: capability.capability,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (canonicalSha256(document) !== capability.document_sha256) {
      return {
        ok: false,
        code: "DOCUMENT_MISMATCH",
        capability: capability.capability,
        message:
          "Released documentation digest differs from projection manifest",
      };
    }
  }

  return {
    ok: true,
    receipt: ArchiveProjectionProofReceiptSchema.parse({
      schema_version: 1,
      change_id: manifest.change_id,
      manifest_sha256: canonicalSha256(manifest),
      released_commit_sha: releasedCommitSha,
      status: "verified",
      verified_at: new Date().toISOString(),
    }),
  };
}

export async function verifyProjectionAtPaths(input: {
  manifest: SpecProjectionManifest;
  root: string;
  releasedCommitSha: string;
  expectedChangeId: string;
  expectedDeltaSetSha256: string;
  expectedDeltaIdsByCapability: Record<string, string[]>;
}): Promise<ProjectionProofResult> {
  return verifyProjection(
    input.manifest,
    input.releasedCommitSha,
    input.expectedChangeId,
    input.expectedDeltaSetSha256,
    input.expectedDeltaIdsByCapability,
    {
      readSpec: async (capability) => {
        const result = await readBoundedProjectionDocument(
          join(input.root, ".adv", "specs", capability, "spec.json"),
        );
        if (result.kind !== "ok") {
          throw new Error(
            result.kind === "not_found"
              ? `spec not found: ${capability}`
              : `spec unreadable for ${capability}: ${result.kind}`,
          );
        }
        return result.content;
      },
      readDocument: async (capability) => {
        const result = await readBoundedProjectionDocument(
          join(input.root, "docs", "specs", `${capability}.md`),
        );
        if (result.kind !== "ok") {
          throw new Error(
            result.kind === "not_found"
              ? `doc not found: ${capability}`
              : `doc unreadable for ${capability}: ${result.kind}`,
          );
        }
        return result.content;
      },
    },
  );
}

/**
 * Stream `git show {commit}:{path}` into memory, killing the process as soon
 * as the output exceeds `limitBytes`. This prevents a runaway or malicious
 * object from being buffered in full before the byte cap is applied.
 */
export async function readGitPathBounded(
  repo: string,
  commitSha: string,
  path: string,
  limitBytes: number = PROJECTION_DOCUMENT_BYTE_LIMIT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnGitStreams(["show", `${commitSha}:${path}`], {
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let killed = false;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      if (killed) return;
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        killed = true;
        chunks.length = 0;
        child.kill("SIGKILL");
        reject(new Error(`git path exceeds bounded projection limit: ${path}`));
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: Error) => {
      if (killed) return;
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (killed) return;
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `git show failed for ${path} (code=${code}, signal=${signal})`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

export async function verifyProjectionAtGitCommit(input: {
  manifest: SpecProjectionManifest;
  repo: string;
  releasedCommitSha: string;
  manifestGitPath: string;
  expectedChangeId: string;
  expectedDeltaSetSha256: string;
  expectedDeltaIdsByCapability: Record<string, string[]>;
}): Promise<ProjectionProofResult> {
  const readGitPath = async (path: string): Promise<string> =>
    readGitPathBounded(input.repo, input.releasedCommitSha, path);
  let committedManifest: SpecProjectionManifest;
  try {
    committedManifest = SpecProjectionManifestSchema.parse(
      JSON.parse(await readGitPath(input.manifestGitPath)),
    );
  } catch (error) {
    return {
      ok: false,
      code: "MANIFEST_UNREADABLE",
      message: `Released projection manifest is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (canonicalSha256(committedManifest) !== canonicalSha256(input.manifest)) {
    return {
      ok: false,
      code: "MANIFEST_MISMATCH",
      message: "Released projection manifest differs from archive evidence",
    };
  }
  return verifyProjection(
    committedManifest,
    input.releasedCommitSha,
    input.expectedChangeId,
    input.expectedDeltaSetSha256,
    input.expectedDeltaIdsByCapability,
    {
      readSpec: (capability) =>
        readGitPath(`.adv/specs/${capability}/spec.json`),
      readDocument: (capability) => readGitPath(`docs/specs/${capability}.md`),
    },
  );
}

export function resolveGitCommitSha(repo: string, ref: string): string | null {
  const result = spawnSyncGit(["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repo,
    encoding: "utf8",
  });
  return result.status === 0 ? String(result.stdout).trim() : null;
}
