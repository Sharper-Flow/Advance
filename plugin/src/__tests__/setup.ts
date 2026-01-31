/**
 * Test Setup & Configuration
 *
 * Global test utilities and setup for vitest
 */

import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Create a temporary directory for test isolation
 */
export async function createTempDir(prefix = "adv-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Create a test project structure with sample data
 */
export async function createTestProject(
  dir: string,
  options: {
    withSpecs?: boolean;
    withChanges?: boolean;
    withConfig?: boolean;
  } = {},
): Promise<void> {
  const { withSpecs = true, withChanges = true, withConfig = true } = options;

  // Create directories
  await mkdir(dir, { recursive: true });

  if (withConfig) {
    await writeFile(
      join(dir, "project.json"),
      JSON.stringify(
        {
          name: "test-project",
          version: "0.1.0",
          specs_dir: ".adv/specs",
          changes_dir: ".adv/changes",
          archive_dir: ".adv/archive",
          docs_dir: "docs/specs",
          db_dir: ".adv/db",
        },
        null,
        2,
      ),
    );
  }

  if (withSpecs) {
    await mkdir(join(dir, ".adv/specs/test-capability"), { recursive: true });
    await writeFile(
      join(dir, ".adv/specs/test-capability/spec.json"),
      JSON.stringify(SAMPLE_SPEC, null, 2),
    );
  }

  if (withChanges) {
    await mkdir(join(dir, ".adv/changes/addFeature"), {
      recursive: true,
    });
    await writeFile(
      join(dir, ".adv/changes/addFeature/change.json"),
      JSON.stringify(SAMPLE_CHANGE, null, 2),
    );
    await writeFile(
      join(dir, ".adv/changes/addFeature/proposal.md"),
      SAMPLE_PROPOSAL,
    );
  }
}

// =============================================================================
// Sample Data Fixtures
// =============================================================================

export const SAMPLE_SPEC = {
  $schema: "https://advance.dev/schemas/spec.v1.json",
  name: "test-capability",
  title: "Test Capability",
  purpose: "A capability for testing purposes",
  version: "1.0.0",
  updated_at: "2026-01-21T00:00:00Z",
  requirements: [
    {
      id: "rq-test0001",
      title: "Sample Requirement",
      body: "This is a sample requirement for testing.\n\nIt has multiple paragraphs.",
      priority: "must",
      tags: ["testing", "sample"],
      scenarios: [
        {
          id: "rq-test0001.1",
          title: "Basic scenario",
          given: ["the system is initialized", "a user exists"],
          when: "the user performs an action",
          then: ["the action succeeds", "the result is recorded"],
        },
        {
          id: "rq-test0001.2",
          title: "Error scenario",
          given: ["the system is initialized", "no user exists"],
          when: "an anonymous action is attempted",
          then: ["the action fails", "an error is returned"],
        },
      ],
    },
    {
      id: "rq-test0002",
      title: "Secondary Requirement",
      body: "Another requirement for search testing with authentication keywords.",
      priority: "should",
      tags: ["security", "authentication"],
      scenarios: [],
    },
  ],
};

export const SAMPLE_CHANGE = {
  $schema: "https://advance.dev/schemas/change.v1.json",
  id: "addFeature",
  title: "Add New Feature",
  status: "active",
  created_at: "2026-01-21T00:00:00Z",
  created_by: "test-user",
  tasks: [
    {
      id: "tk-task0001",
      title: "Implement core logic",
      section: "Core",
      status: "pending",
      priority: 0,
      deps: [],
      created_at: "2026-01-21T00:00:00Z",
    },
    {
      id: "tk-task0002",
      title: "Write tests",
      section: "Testing",
      status: "pending",
      priority: 1,
      deps: [{ type: "blocked_by", target: "tk-task0001" }],
      created_at: "2026-01-21T00:00:00Z",
    },
    {
      id: "tk-task0003",
      title: "Update documentation",
      section: "Docs",
      status: "pending",
      priority: 2,
      deps: [{ type: "blocked_by", target: "tk-task0002" }],
      created_at: "2026-01-21T00:00:00Z",
    },
  ],
  deltas: {
    "test-capability": [
      {
        id: "dl-delta001",
        operation: "add",
        requirement: {
          id: "rq-new00001",
          title: "New Requirement from Change",
          body: "This requirement will be added when the change is archived.",
          priority: "must",
          scenarios: [],
        },
      },
    ],
  },
  validation: {
    checked_against_specs: ["test-capability"],
    conflicts: [],
    warnings: [],
    validated_at: "2026-01-21T00:00:00Z",
  },
};

export const SAMPLE_PROPOSAL = `# Add New Feature

## Summary

This change adds a new feature to the system.

## Motivation

Users need this feature to accomplish their goals.

## Acceptance Criteria

- [ ] Core logic implemented
- [ ] Tests written and passing
- [ ] Documentation updated
`;

// =============================================================================
// Assertion Helpers
// =============================================================================

import { access } from "fs/promises";

/**
 * Assert that a file exists
 */
export async function assertFileExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Expected file to exist: ${path}`);
  }
}

/**
 * Assert that a file contains specific content
 */
export async function assertFileContains(
  path: string,
  content: string,
): Promise<void> {
  const text = await readFile(path, "utf-8");
  if (!text.includes(content)) {
    throw new Error(`Expected file ${path} to contain: ${content}`);
  }
}

/**
 * Assert that JSON file matches expected structure
 */
export async function assertJsonFile<T>(
  path: string,
  validator: (data: T) => boolean,
  message?: string,
): Promise<T> {
  const text = await readFile(path, "utf-8");
  const data = JSON.parse(text);
  if (!validator(data)) {
    throw new Error(message ?? `JSON validation failed for: ${path}`);
  }
  return data as T;
}

// =============================================================================
// Tool Output Helpers
// =============================================================================

/**
 * Extract JSON from banner-wrapped tool output.
 *
 * Banner format:
 * ```
 * ╔═══════════════════╗
 * ║ 📊 adv_status     ║
 * ╚═══════════════════╝
 *
 * { json data }
 * ```
 *
 * Also handles pure JSON output (no banner).
 */
export function parseToolOutput<T = unknown>(output: string): T {
  // If it starts with { or [, it's pure JSON
  const trimmed = output.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as T;
  }

  // Find first { or [ which starts the JSON
  const jsonStart = output.search(/[{[]/);
  if (jsonStart === -1) {
    throw new Error("No JSON found in output");
  }
  return JSON.parse(output.slice(jsonStart)) as T;
}
