import { join, basename } from "path";
import { mkdir, readdir, readFile, access } from "fs/promises";
import { ZodError } from "zod";
import type { RetiredEpicProjection } from "../types";
import { RetiredEpicProjectionSchema } from "../types";
import { atomicWriteFile } from "../utils/fs";
import type { LoadResult } from "./json";

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
