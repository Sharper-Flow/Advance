import { readFile } from "fs/promises";
import { join } from "path";

import type { WisdomEntry } from "../types";
import { atomicWriteFile } from "./fs";

export interface AppendWisdomResult {
  ok: true;
  path: string;
  appended: number;
}

export async function appendWisdom(
  projectPath: string,
  entries: WisdomEntry[],
): Promise<AppendWisdomResult> {
  const path = join(projectPath, ".adv", "wisdom.jsonl");
  let existing = "";
  try {
    existing = await readFile(path, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  const seen = new Set(
    existing
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return (JSON.parse(line) as { id?: string }).id;
        } catch {
          return undefined;
        }
      })
      .filter((id): id is string => typeof id === "string"),
  );
  const promotable = entries.filter(
    (entry) =>
      ["convention", "pattern"].includes(entry.type) && !seen.has(entry.id),
  );
  const next = [
    ...existing.split("\n").filter(Boolean),
    ...promotable.map((entry) => JSON.stringify(entry)),
  ];
  await atomicWriteFile(path, next.length ? `${next.join("\n")}\n` : "");
  return { ok: true, path, appended: promotable.length };
}
