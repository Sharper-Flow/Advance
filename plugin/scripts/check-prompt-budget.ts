#!/usr/bin/env node
/**
 * CI check for the eager per-session instruction floor.
 *
 * The measured floor intentionally includes files outside this repository:
 * those files are part of the prompt assembled for a real OpenCode session.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { join, relative, resolve } from "path";
import { parse, type ParseError } from "jsonc-parser";
import { parseFrontmatterText } from "../src/utils/manifest-frontmatter";

const scriptDir = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(scriptDir, "../..");
const home = homedir();
const baselinePath = join(repoRoot, ".opencode", "prompt-floor-baselines.json");
const skillWrapperBytes = 90;

export interface PromptFloor {
  floorBytes: number;
  instructionCount: number;
}

type Baseline = PromptFloor;

interface OpenCodeConfig {
  instructions?: unknown;
}

const warnings: string[] = [];

function warn(message: string): void {
  warnings.push(`warning: ${message}`);
}

function readBytes(filePath: string, label: string): Buffer | null {
  try {
    return readFileSync(filePath);
  } catch (error) {
    warn(`skipped ${label} ${filePath}: ${(error as Error).message}`);
    return null;
  }
}

function expandInstructionPath(instructionPath: string): string {
  if (instructionPath === "~") {
    return home;
  }
  if (instructionPath.startsWith("~/")) {
    return join(home, instructionPath.slice(2));
  }
  return resolve(repoRoot, instructionPath);
}

function configuredInstructionPaths(): string[] {
  const configPath = join(home, ".config", "opencode", "opencode.jsonc");
  const configBytes = readBytes(configPath, "OpenCode config");
  if (!configBytes) {
    return [];
  }

  const errors: ParseError[] = [];
  const config = parse(configBytes.toString("utf8"), errors) as OpenCodeConfig;
  if (errors.length > 0) {
    warn(`could not fully parse ${configPath}; using readable instructions`);
  }
  if (!Array.isArray(config?.instructions)) {
    warn(`no instructions[] array found in ${configPath}`);
    return [];
  }

  return config.instructions.flatMap((entry) => {
    if (typeof entry !== "string") {
      warn(`skipped non-string instruction entry in ${configPath}`);
      return [];
    }
    return [expandInstructionPath(entry)];
  });
}

function markdownFiles(dir: string, label: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    warn(`skipped ${label} directory ${dir}: ${(error as Error).message}`);
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

function skillFiles(root: string): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    warn(`skipped skill directory ${root}: ${(error as Error).message}`);
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, "SKILL.md"))
    .filter((filePath) => existsSync(filePath))
    .sort();
}

function parseSkillFrontmatter(text: string) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === "---");
  if (start <= 0) {
    return parseFrontmatterText(text);
  }

  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === "---",
  );
  if (end < 0) {
    return parseFrontmatterText(text);
  }

  return parseFrontmatterText(lines.slice(start, end + 1).join("\n"));
}

function skillCost(filePath: string, bytes: Buffer): number {
  const parsed = parseSkillFrontmatter(bytes.toString("utf8"));
  if (!parsed.ok) {
    warn(`could not parse skill frontmatter ${filePath}: ${parsed.error}`);
  }

  const name = typeof parsed.doc?.name === "string" ? parsed.doc.name : "";
  const description =
    typeof parsed.doc?.description === "string" ? parsed.doc.description : "";
  if (!name || !description) {
    warn(`skill frontmatter missing name or description: ${filePath}`);
  }

  return (
    skillWrapperBytes +
    Buffer.byteLength(name, "utf8") +
    Buffer.byteLength(description, "utf8")
  );
}

function countRules(): number {
  const rulesPath = join(
    home,
    ".config",
    "opencode",
    "instructions",
    "rules.yaml",
  );
  const bytes = readBytes(rulesPath, "P-rule file");
  if (!bytes) {
    return 0;
  }
  return (bytes.toString("utf8").match(/^[ \t]{2}P\d+:/gm) ?? []).length;
}

export function measurePromptFloor(): PromptFloor {
  let floorBytes = 0;
  let instructionCount = 0;

  const instructionPaths = [
    join(home, ".config", "opencode", "AGENTS.md"),
    join(repoRoot, "AGENTS.md"),
    ...configuredInstructionPaths(),
  ];
  for (const filePath of instructionPaths) {
    const bytes = readBytes(filePath, "instruction file");
    if (bytes) {
      floorBytes += bytes.byteLength;
      instructionCount++;
    }
  }

  const agentPaths = markdownFiles(
    join(repoRoot, ".opencode", "agents"),
    "agent manifests",
  );
  for (const filePath of agentPaths) {
    const bytes = readBytes(filePath, "agent manifest");
    if (bytes) {
      floorBytes += bytes.byteLength;
      instructionCount++;
    }
  }

  for (const skillRoot of [
    join(home, ".config", "opencode", "skills"),
    join(home, ".claude", "skills"),
  ]) {
    for (const filePath of skillFiles(skillRoot)) {
      const bytes = readBytes(filePath, "skill file");
      if (bytes) {
        floorBytes += skillCost(filePath, bytes);
      }
    }
  }

  instructionCount += countRules();

  return { floorBytes, instructionCount };
}

function readBaseline(): Baseline | null {
  const bytes = readBytes(baselinePath, "prompt-floor baseline");
  if (!bytes) {
    return null;
  }

  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as Partial<Baseline>;
    if (
      typeof parsed.floorBytes !== "number" ||
      typeof parsed.instructionCount !== "number"
    ) {
      throw new Error("expected numeric floorBytes and instructionCount");
    }
    return {
      floorBytes: parsed.floorBytes,
      instructionCount: parsed.instructionCount,
    };
  } catch (error) {
    warn(`could not parse ${baselinePath}: ${(error as Error).message}`);
    return null;
  }
}

function printWarnings(): void {
  for (const message of warnings) {
    console.warn(message);
  }
}

function main(): void {
  const current = measurePromptFloor();

  if (process.argv.includes("--update-baselines")) {
    printWarnings();
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(
      `prompt floor baseline updated: ${current.floorBytes} bytes, ${current.instructionCount} instruction/rule entries`,
    );
    return;
  }

  const baseline = readBaseline();
  printWarnings();
  if (!baseline) {
    console.error(
      `prompt floor check failed: baseline unavailable at ${relative(repoRoot, baselinePath)}`,
    );
    process.exitCode = 1;
    return;
  }

  const regressions: string[] = [];
  if (current.floorBytes > baseline.floorBytes) {
    regressions.push(
      `floorBytes: ${current.floorBytes} (+${current.floorBytes - baseline.floorBytes}) > ${baseline.floorBytes}`,
    );
  }
  if (current.instructionCount > baseline.instructionCount) {
    regressions.push(
      `instructionCount: ${current.instructionCount} (+${current.instructionCount - baseline.instructionCount}) > ${baseline.instructionCount}`,
    );
  }

  if (regressions.length > 0) {
    console.error("prompt floor regression detected:");
    for (const regression of regressions) {
      console.error(`  ${regression}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `prompt floor check passed: ${current.floorBytes}/${baseline.floorBytes} bytes, ${current.instructionCount}/${baseline.instructionCount} instruction/rule entries`,
  );
}

main();
