/**
 * Neutral filesystem helpers for spec reads.
 *
 * These helpers used to live in `temporal/activities` and were consumed by
 * both Temporal activities and the store-temporal read surface. Moving them to
 * a storage-owned module lets pure readers use them without crossing into the
 * Temporal surface. Temporal activities may re-export/import them for
 * backward compatibility.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { listSpecDirs } from "./json";

export interface ListSpecsInput {
  specsDir: string;
}

export type ListSpecsResult =
  | { ok: true; specs: string[] }
  | { ok: false; error: string; specs?: undefined };

export async function listSpecsFilesystem(
  input: ListSpecsInput,
): Promise<ListSpecsResult> {
  try {
    // listSpecDirs swallows ENOENT and returns []. Anything else propagates.
    const specs = await listSpecDirs(input.specsDir);
    return { ok: true, specs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `listSpecs failed: ${message}` };
  }
}

export interface ShowSpecInput {
  specsDir: string;
  capability: string;
}

export type ShowSpecResult =
  | { ok: true; content: string; path: string }
  | { ok: false; error: string; content?: undefined; path?: undefined };

export async function readSpecFilesystem(
  input: ShowSpecInput,
): Promise<ShowSpecResult> {
  const path = join(input.specsDir, input.capability, "spec.json");
  try {
    const content = await readFile(path, "utf-8");
    return { ok: true, content, path };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `Spec not found: ${input.capability} (${path})`
          : `Read failed (${code ?? "unknown"}): ${message}`,
    };
  }
}
