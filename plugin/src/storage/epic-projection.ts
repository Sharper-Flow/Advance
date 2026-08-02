import { join, basename } from "path";
import { mkdir, readdir, access, rm } from "fs/promises";
import { ZodError } from "zod";
import type { Epic, RetiredEpicProjection } from "../types";
import { EpicSchema, RetiredEpicProjectionSchema } from "../types";
import { atomicWriteFile } from "../utils/fs";
import {
  readBoundedProjectionDocument,
  loadFailureToWarning,
  type ProjectionDocumentWarning,
  type LoadResult,
} from "./change-projection-reader";

function formatZodError(
  error: ZodError,
  context: { type: string; id: string; path: string },
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path || "(root)"}: ${issue.message}`;
  });
  return (
    `Schema validation failed for ${context.type} "${context.id}":\n` +
    `File: ${context.path}\n` +
    `Issues:\n${issues.join("\n")}\n` +
    `Hint: Ensure the ${context.type}.json matches the schema.`
  );
}

export async function loadRetiredEpicProjection(
  retiredEpicsDir: string | undefined,
  epicId: string,
): Promise<LoadResult<RetiredEpicProjection | null>> {
  if (!retiredEpicsDir) {
    return { success: true, data: null };
  }

  const projectionPath = join(
    retiredEpicsDir,
    epicId,
    "retired-projection.json",
  );

  const readResult = await readBoundedProjectionDocument(projectionPath);
  if (readResult.kind !== "ok") {
    if (readResult.kind === "not_found") {
      return { success: true, data: null };
    }
    return {
      success: false,
      error: `Failed to read retired epic projection ${epicId}: ${readResult.kind}${readResult.kind === "oversized" ? ` (${readResult.actual} > ${readResult.limit} bytes)` : ""} (${projectionPath})`,
      type: readResult.kind === "corrupt" ? "corrupt" : readResult.kind,
    };
  }

  try {
    const parsed = JSON.parse(readResult.content);
    return {
      success: true,
      data: RetiredEpicProjectionSchema.parse(parsed),
      source: "retired_projection",
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "retired epic projection",
          id: epicId,
          path: projectionPath,
        }),
        type: "schema_error",
      };
    }
    return {
      success: false,
      error: `Retired epic projection ${epicId} is corrupt: ${error instanceof Error ? error.message : String(error)} (${projectionPath})`,
      type: "corrupt",
    };
  }
}

export async function saveRetiredEpicProjection(
  retiredEpicsDir: string,
  epicId: string,
  projection: RetiredEpicProjection,
): Promise<void> {
  const projectionDir = join(retiredEpicsDir, epicId);
  const projectionPath = join(projectionDir, "retired-projection.json");
  await mkdir(projectionDir, { recursive: true });
  await atomicWriteFile(projectionPath, JSON.stringify(projection, null, 2));
}

export async function loadActiveEpicProjection(
  activeEpicsDir: string | undefined,
  epicId: string,
): Promise<LoadResult<Epic | null>> {
  if (!activeEpicsDir) return { success: true, data: null };
  const path = join(activeEpicsDir, epicId, "active-projection.json");
  const readResult = await readBoundedProjectionDocument(path);
  if (readResult.kind !== "ok") {
    if (readResult.kind === "not_found") return { success: true, data: null };
    return {
      success: false,
      error: `Failed to read active epic projection ${epicId}: ${readResult.kind}${readResult.kind === "oversized" ? ` (${readResult.actual} > ${readResult.limit} bytes)` : ""} (${path})`,
      type: readResult.kind === "corrupt" ? "corrupt" : readResult.kind,
    };
  }

  try {
    return {
      success: true,
      data: EpicSchema.parse(JSON.parse(readResult.content)),
      source: "active_projection",
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "active epic projection",
          id: epicId,
          path,
        }),
        type: "schema_error",
      };
    }
    return {
      success: false,
      error: `Active epic projection ${epicId} is corrupt: ${error instanceof Error ? error.message : String(error)} (${path})`,
      type: "corrupt",
    };
  }
}

export async function saveActiveEpicProjection(
  activeEpicsDir: string,
  epic: Epic,
): Promise<void> {
  const dir = join(activeEpicsDir, epic.id);
  await mkdir(dir, { recursive: true });
  await atomicWriteFile(
    join(dir, "active-projection.json"),
    JSON.stringify(EpicSchema.parse(epic), null, 2),
  );
}

export async function removeActiveEpicProjection(
  activeEpicsDir: string | undefined,
  epicId: string,
): Promise<void> {
  if (!activeEpicsDir) return;
  await rm(join(activeEpicsDir, epicId), { recursive: true, force: true });
}

export async function listActiveEpicProjections(
  activeEpicsDir: string | undefined,
): Promise<LoadResult<Epic[]>> {
  if (!activeEpicsDir) return { success: true, data: [] };
  try {
    const entries = await readdir(activeEpicsDir, { withFileTypes: true });
    const warnings: ProjectionDocumentWarning[] = [];
    const data: Epic[] = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const result = await loadActiveEpicProjection(activeEpicsDir, entry.name);
      if (result.success && result.data) {
        data.push(result.data);
      } else if (!result.success) {
        warnings.push(
          loadFailureToWarning(
            join(activeEpicsDir, entry.name, "active-projection.json"),
            { type: result.type, error: result.error },
          ),
        );
      }
    }
    return {
      success: true,
      data: data.sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
      ),
      ...(warnings.length > 0 && { warnings }),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { success: true, data: [] };
    return { success: false, error: String(error), type: "read_error" };
  }
}

export async function listRetiredEpicProjections(
  retiredEpicsDir: string | undefined,
): Promise<LoadResult<Epic[]>> {
  if (!retiredEpicsDir) return { success: true, data: [] };
  try {
    const entries = await readdir(retiredEpicsDir, { withFileTypes: true });
    const warnings: ProjectionDocumentWarning[] = [];
    const data: Epic[] = [];
    for (const entry of entries.filter((entry) => entry.isDirectory())) {
      const result = await loadRetiredEpicProjection(
        retiredEpicsDir,
        entry.name,
      );
      if (result.success && result.data) {
        data.push(result.data.epic_snapshot);
      } else if (!result.success) {
        warnings.push(
          loadFailureToWarning(
            join(retiredEpicsDir, entry.name, "retired-projection.json"),
            { type: result.type, error: result.error },
          ),
        );
      }
    }
    return {
      success: true,
      data: data.sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
      ),
      ...(warnings.length > 0 && { warnings }),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { success: true, data: [] };
    return {
      success: false,
      error: `Failed to list retired epic projections: ${error instanceof Error ? error.message : String(error)}`,
      type: "read_error",
    };
  }
}

export async function listRetiredEpicIds(
  retiredEpicsDir: string | undefined,
): Promise<string[]> {
  if (!retiredEpicsDir) return [];

  try {
    await access(retiredEpicsDir);
  } catch {
    return [];
  }

  try {
    const entries = await readdir(retiredEpicsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => basename(e.name));
  } catch {
    return [];
  }
}
