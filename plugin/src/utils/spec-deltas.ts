import { readFile } from "fs/promises";
import { join } from "path";

import { applyDeltasToSpec, createSpecFromDeltas } from "../archive/delta";
import type { Delta, Spec } from "../types";
import { atomicWriteFile } from "./fs";

export type ApplySpecDeltaResult =
  | { ok: true; capability: string; path: string; applied: number }
  | {
      ok: false;
      capability: string;
      error: string;
      path?: undefined;
      applied?: undefined;
    };

export async function applySpecDelta(
  projectPath: string,
  capability: string,
  deltas: Delta[],
): Promise<ApplySpecDeltaResult> {
  const specPath = join(projectPath, ".adv", "specs", capability, "spec.json");
  try {
    let spec: Spec | undefined;
    try {
      spec = JSON.parse(await readFile(specPath, "utf-8")) as Spec;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    const result = spec
      ? applyDeltasToSpec(structuredClone(spec), deltas, spec.version)
      : createSpecFromDeltas(capability, deltas).result;

    if (!result.updatedSpec) {
      const failed = result.deltaResults.find((delta) => !delta.success);
      return {
        ok: false,
        capability,
        error: failed?.error ?? `No updated spec produced for ${capability}`,
      };
    }

    await atomicWriteFile(
      specPath,
      `${JSON.stringify(result.updatedSpec, null, 2)}\n`,
    );
    return { ok: true, capability, path: specPath, applied: deltas.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, capability, error: message };
  }
}
