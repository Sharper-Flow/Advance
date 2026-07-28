import { join, basename } from "path";
import { mkdir, readdir, readFile, access, rm } from "fs/promises";
import { ZodError } from "zod";
import type { Epic, RetiredEpicProjection } from "../types";
import { EpicSchema, RetiredEpicProjectionSchema } from "../types";
import { atomicWriteFile } from "../utils/fs";
import type { LoadResult } from "./change-projection-reader";

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

  try {
    const content = await readFile(projectionPath, "utf-8");
    const parsed = JSON.parse(content);
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
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: null };
    } else {
      return {
        success: false,
        error: `Failed to read retired epic projection ${epicId}: ${error instanceof Error ? error.message : String(error)}`,
        type: "read_error",
      };
    }
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
  try {
    return {
      success: true,
      data: EpicSchema.parse(JSON.parse(await readFile(path, "utf8"))),
      source: "active_projection",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { success: true, data: null };
    return {
      success: false,
      error: `Failed to read active epic projection ${epicId}: ${error instanceof Error ? error.message : String(error)}`,
      type: error instanceof ZodError ? "schema_error" : "read_error",
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
    const results = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map((e) => loadActiveEpicProjection(activeEpicsDir, e.name)),
    );
    const bad = results.find((r) => !r.success);
    if (bad && !bad.success) return bad as LoadResult<Epic[]>;
    return {
      success: true,
      data: results
        .flatMap((r) => (r.success && r.data ? [r.data] : []))
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        ),
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
    const loaded = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadRetiredEpicProjection(retiredEpicsDir, entry.name)),
    );
    const failed = loaded.find((result) => !result.success);
    if (failed && !failed.success) return failed as LoadResult<Epic[]>;
    return {
      success: true,
      data: loaded
        .flatMap((result) =>
          result.success && result.data ? [result.data.epic_snapshot] : [],
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        ),
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
