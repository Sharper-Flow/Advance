/**
 * JSON File Storage
 *
 * Handles reading/writing JSON files for specs and changes.
 * JSON files are the source of truth.
 */

import { join } from "path";
import { readdir, mkdir } from "fs/promises";
import { SpecSchema, ChangeSchema, ProjectConfigSchema } from "../types";
import type { Spec, Change, ProjectConfig } from "../types";

// =============================================================================
// File Paths
// =============================================================================

export interface ProjectPaths {
  root: string;
  specs: string;
  changes: string;
  archive: string;
  docs: string;
  db: string;
  config: string;
}

export function getProjectPaths(root: string, config?: Partial<ProjectConfig>): ProjectPaths {
  return {
    root,
    specs: join(root, config?.specs_dir ?? "specs"),
    changes: join(root, config?.changes_dir ?? "changes"),
    archive: join(root, config?.archive_dir ?? "archive"),
    docs: join(root, config?.docs_dir ?? "docs/specs"),
    db: join(root, config?.db_dir ?? ".specdb"),
    config: join(root, "project.json"),
  };
}

// =============================================================================
// Project Config
// =============================================================================

export async function loadProjectConfig(root: string): Promise<ProjectConfig | null> {
  const configPath = join(root, "project.json");

  try {
    const file = Bun.file(configPath);
    const exists = await file.exists();
    if (!exists) return null;

    const content = await file.json();
    return ProjectConfigSchema.parse(content);
  } catch {
    return null;
  }
}

export async function saveProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const configPath = join(root, "project.json");
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

// =============================================================================
// Spec Operations
// =============================================================================

export async function listSpecDirs(specsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(specsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function loadSpec(specsDir: string, capability: string): Promise<Spec | null> {
  const specPath = join(specsDir, capability, "spec.json");

  try {
    const file = Bun.file(specPath);
    const exists = await file.exists();
    if (!exists) return null;

    const content = await file.json();
    return SpecSchema.parse(content);
  } catch (error) {
    console.error(`Failed to load spec ${capability}:`, error);
    return null;
  }
}

export async function loadAllSpecs(specsDir: string): Promise<Map<string, Spec>> {
  const specs = new Map<string, Spec>();
  const dirs = await listSpecDirs(specsDir);

  for (const dir of dirs) {
    const spec = await loadSpec(specsDir, dir);
    if (spec) {
      specs.set(spec.name, spec);
    }
  }

  return specs;
}

export async function saveSpec(specsDir: string, spec: Spec): Promise<string> {
  const specDir = join(specsDir, spec.name);
  const specPath = join(specDir, "spec.json");

  await mkdir(specDir, { recursive: true });
  await Bun.write(specPath, JSON.stringify(spec, null, 2));

  return specPath;
}

// =============================================================================
// Change Operations
// =============================================================================

export async function listChangeDirs(changesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function loadChange(changesDir: string, changeId: string): Promise<Change | null> {
  const changePath = join(changesDir, changeId, "change.json");

  try {
    const file = Bun.file(changePath);
    const exists = await file.exists();
    if (!exists) return null;

    const content = await file.json();
    return ChangeSchema.parse(content);
  } catch (error) {
    console.error(`Failed to load change ${changeId}:`, error);
    return null;
  }
}

export async function loadAllChanges(changesDir: string): Promise<Map<string, Change>> {
  const changes = new Map<string, Change>();
  const dirs = await listChangeDirs(changesDir);

  for (const dir of dirs) {
    const change = await loadChange(changesDir, dir);
    if (change) {
      changes.set(change.id, change);
    }
  }

  return changes;
}

export async function saveChange(changesDir: string, change: Change): Promise<string> {
  const changeDir = join(changesDir, change.id);
  const changePath = join(changeDir, "change.json");

  await mkdir(changeDir, { recursive: true });
  await Bun.write(changePath, JSON.stringify(change, null, 2));

  return changePath;
}

export async function createChangeScaffold(
  changesDir: string,
  changeId: string,
  title: string
): Promise<{ changePath: string; proposalPath: string }> {
  const changeDir = join(changesDir, changeId);
  const changePath = join(changeDir, "change.json");
  const proposalPath = join(changeDir, "proposal.md");

  await mkdir(changeDir, { recursive: true });

  // Create proposal.md template
  const proposalContent = `# ${title}

## Summary

<!-- Brief description of what this change accomplishes -->

## Motivation

<!-- Why is this change needed? What problem does it solve? -->

## Design

<!-- How will this be implemented? -->

## Acceptance Criteria

<!-- How will we know when this is done? -->

- [ ] Criterion 1
- [ ] Criterion 2
`;

  await Bun.write(proposalPath, proposalContent);

  return { changePath, proposalPath };
}

// =============================================================================
// File Utilities
// =============================================================================

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path);
    return await file.exists();
  } catch {
    return false;
  }
}

export async function getFileMtime(path: string): Promise<Date | null> {
  try {
    const file = Bun.file(path);
    const stat = await file.stat();
    return new Date(stat.mtime);
  } catch {
    return null;
  }
}
