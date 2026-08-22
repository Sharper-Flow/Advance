import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, sep } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createInRepoArchive } from "./archive/archive";
import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "./__tests__/setup";
import { changeTools } from "./tools/change";
import { readArtifact, readArtifacts } from "./tools/change/artifacts";
import { createDiskStore } from "./storage/store-disk";
import {
  ARTIFACT_FILENAME,
  ArtifactKindSchema,
  type ArtifactKind,
} from "./types/artifacts";
import type { Change } from "./types";
import type { Store } from "./storage/store";

const mocks = vi.hoisted(() => ({
  withTargetPathStore: vi.fn(),
}));

vi.mock("./tools/target-project", async () => {
  const actual = await vi.importActual<typeof import("./tools/target-project")>(
    "./tools/target-project",
  );
  return {
    ...actual,
    withTargetPathStore: mocks.withTargetPathStore,
  };
});

const ARTIFACT_KINDS = ArtifactKindSchema.options;
const CREATE_ARTIFACT_KINDS = ARTIFACT_KINDS.filter(
  (kind) => kind !== "acceptance",
);
const tempDirs: string[] = [];

afterEach(async () => {
  mocks.withTargetPathStore.mockReset();
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

function contents(prefix: string): Record<ArtifactKind, string> {
  return {
    proposal: `${prefix} proposal`,
    problemStatement: `${prefix} problem statement`,
    agreement: `${prefix} agreement`,
    design: `${prefix} design`,
    executiveSummary: `${prefix} executive summary`,
    acceptance: `${prefix} acceptance`,
  };
}

async function projectStore(prefix: string): Promise<Store> {
  const root = await createTempDir(`adv-artifact-authority-${prefix}-`);
  tempDirs.push(root);
  return createDiskStore(root);
}

async function readArchiveArtifacts(
  archivePath: string,
): Promise<Record<ArtifactKind, string>> {
  const entries = await Promise.all(
    ARTIFACT_KINDS.map(
      async (kind) =>
        [
          kind,
          await readFile(join(archivePath, ARTIFACT_FILENAME[kind]), "utf8"),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<ArtifactKind, string>;
}

function expectProjectionRead(
  result: Partial<Record<ArtifactKind, { content: string; source: string }>>,
  expected: Record<ArtifactKind, string>,
): void {
  expect(result).toEqual(
    Object.fromEntries(
      ARTIFACT_KINDS.map((kind) => [
        kind,
        { content: expected[kind], source: "active_projection" },
      ]),
    ),
  );
}

function expectNoMarkdownArtifactPaths(output: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(output)) {
    expect(
      key.endsWith("Path") &&
        typeof value === "string" &&
        value.endsWith(".md"),
      `${key} must not advertise a markdown artifact path`,
    ).toBe(false);
  }
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("artifact authority chain", () => {
  test("create, update, read, and archive preserve all six projection artifacts", async () => {
    const store = await projectStore("create-update");
    const initial = contents("initial");
    const created = await store.changes.create("Artifact authority chain", {
      artifacts: Object.fromEntries(
        CREATE_ARTIFACT_KINDS.map((kind) => [kind, initial[kind]]),
      ),
    });
    const changeDir = join(store.paths.changes, created.changeId);

    expect(
      await Promise.all(
        ARTIFACT_KINDS.map((kind) =>
          existsSync(join(changeDir, ARTIFACT_FILENAME[kind])),
        ),
      ),
    ).toEqual(ARTIFACT_KINDS.map(() => false));
    const createdChange = (await store.changes.get(created.changeId))
      .data as Change;
    // The create/update artifact inputs intentionally omit acceptance. Seed
    // that projection field here so the end-to-end read/archive sweep covers
    // all six canonical kinds without changing production behavior.
    await store.changes.save({
      ...createdChange,
      documents: { ...createdChange.documents, acceptance: initial.acceptance },
    });
    expectProjectionRead(
      await readArtifacts(store, created.changeId, [...ARTIFACT_KINDS]),
      initial,
    );

    const updates = {
      proposal: "updated proposal",
      problemStatement: "updated problem statement",
      agreement: "updated agreement",
      design: "updated design",
      executiveSummary: "updated executive summary",
    } as const;
    const updateOutput = parseToolOutput(
      await changeTools.adv_change_update.execute(
        { changeId: created.changeId, ...updates },
        store,
      ),
    );
    expect(updateOutput).toMatchObject({
      success: true,
      changeId: created.changeId,
      artifactAuthority: "change.documents",
    });

    const current = { ...initial, ...updates };
    const currentChange = (await store.changes.get(created.changeId)).data;
    expect(currentChange?.documents).toEqual(current);
    expectProjectionRead(
      await readArtifacts(store, created.changeId, [...ARTIFACT_KINDS]),
      current,
    );
    for (const kind of ARTIFACT_KINDS) {
      await expect(
        readArtifact(store, created.changeId, kind),
      ).resolves.toEqual({
        content: current[kind],
        source: "active_projection",
      });
    }

    const archivePath = await createInRepoArchive(
      currentChange as Change,
      store.paths.archive,
      changeDir,
      undefined,
      "2026-05-08T00:00:00.000Z",
    );
    await expect(readArchiveArtifacts(archivePath)).resolves.toEqual(current);
  });

  test("archive never overwrites newer projection content with stale active markdown", async () => {
    const store = await projectStore("stale-overwrite");
    const projection = contents("projection");
    const created = await store.changes.create("Stale artifact transition", {
      artifacts: Object.fromEntries(
        CREATE_ARTIFACT_KINDS.map((kind) => [kind, projection[kind]]),
      ),
    });
    const changeDir = join(store.paths.changes, created.changeId);
    const createdChange = (await store.changes.get(created.changeId))
      .data as Change;
    await store.changes.save({
      ...createdChange,
      documents: {
        ...createdChange.documents,
        acceptance: projection.acceptance,
      },
    });
    const stale = contents("stale disk");
    await Promise.all(
      ARTIFACT_KINDS.map((kind) =>
        writeFile(join(changeDir, ARTIFACT_FILENAME[kind]), stale[kind]),
      ),
    );

    const change = (await store.changes.get(created.changeId)).data as Change;
    const archivePath = await createInRepoArchive(
      change,
      store.paths.archive,
      changeDir,
      undefined,
      "2026-05-08T00:00:00.000Z",
    );

    await expect(readArchiveArtifacts(archivePath)).resolves.toEqual(
      projection,
    );
  });

  test("legacy disk artifacts remain readable and archiveable with an empty projection", async () => {
    const store = await projectStore("legacy");
    const created = await store.changes.create("Legacy artifact transition");
    const changeDir = join(store.paths.changes, created.changeId);
    const createdChange = (await store.changes.get(created.changeId))
      .data as Change;
    await store.changes.save({ ...createdChange, documents: {} });
    const legacy = contents("legacy disk");
    await Promise.all(
      ARTIFACT_KINDS.map((kind) =>
        writeFile(join(changeDir, ARTIFACT_FILENAME[kind]), legacy[kind]),
      ),
    );

    const diskRead = await readArtifacts(store, created.changeId, [
      ...ARTIFACT_KINDS,
    ]);
    expect(diskRead).toEqual(
      Object.fromEntries(
        ARTIFACT_KINDS.map((kind) => [
          kind,
          { content: legacy[kind], source: "disk" },
        ]),
      ),
    );

    const change = (await store.changes.get(created.changeId)).data as Change;
    const archivePath = await createInRepoArchive(
      change,
      store.paths.archive,
      changeDir,
      undefined,
      "2026-05-08T00:00:00.000Z",
    );
    await expect(readArchiveArtifacts(archivePath)).resolves.toEqual(legacy);
  });

  test("cross-project create and update keep target projection as artifact authority", async () => {
    const sourceStore = await projectStore("cross-source");
    const targetStore = await projectStore("cross-target");
    const targetRoot = targetStore.paths.root;
    mocks.withTargetPathStore.mockImplementation(
      async (
        _input: unknown,
        callback: (value: {
          context: {
            root: string;
            projectId: string;
            externalRoot: string;
            trusted: boolean;
            trustSource: string;
            stateMode: "current";
          };
          store: Store;
        }) => Promise<string>,
      ) =>
        callback({
          context: {
            root: targetRoot,
            projectId: "target-project",
            externalRoot: targetRoot,
            trusted: true,
            trustSource: "test",
            stateMode: "current",
          },
          store: targetStore,
        }),
    );

    const createdOutput = parseToolOutput(
      await changeTools.adv_change_create.execute(
        {
          summary: "Cross project artifact chain",
          target_path: targetRoot,
          target_confirmed: true,
          confirmationEvidence: "test-approved target",
          proposal: "cross project proposal",
          problemStatement: "cross project problem",
          agreement: "cross project agreement",
          design: "cross project design",
          executiveSummary: "cross project summary",
        },
        sourceStore,
      ),
    );
    expectNoMarkdownArtifactPaths(createdOutput);
    expect(createdOutput).toMatchObject({
      artifactAuthority: "change.documents",
      target_path: targetRoot,
    });

    const changeId = String(createdOutput.changeId);
    const initialProposal = await readArtifact(
      targetStore,
      changeId,
      "proposal",
    );
    expect(initialProposal).toEqual({
      content: expect.stringContaining("cross project proposal"),
      source: "active_projection",
    });

    const updatedOutput = parseToolOutput(
      await changeTools.adv_change_update.execute(
        {
          changeId,
          proposal: "cross project updated proposal",
          target_path: targetRoot,
          target_confirmed: true,
          confirmationEvidence: "test-approved target update",
        },
        sourceStore,
      ),
    );
    expectNoMarkdownArtifactPaths(updatedOutput);
    expect(updatedOutput).toMatchObject({
      success: true,
      changeId,
      artifactAuthority: "change.documents",
      _projectContext: { root: targetRoot },
    });
    await expect(
      readArtifact(targetStore, changeId, "proposal"),
    ).resolves.toEqual({
      content: "cross project updated proposal",
      source: "active_projection",
    });
  });

  test("only the archive boundary may write projection narrative markdown", async () => {
    const srcRoot = fileURLToPath(new URL(".", import.meta.url));
    const files = await sourceFiles(srcRoot);
    const unauthorized = [] as string[];

    for (const file of files) {
      if (file.split(sep).includes("archive")) continue;
      if (file.endsWith(".test.ts")) continue;
      const source = await readFile(file, "utf8");
      // `writeArtifact` is the legacy active-dir materializer. A reference in
      // production code is enough to prove that this live producer remains;
      // archive/archive.ts is the sole permitted production boundary.
      if (/\bwriteArtifact\s*\(/.test(source)) {
        unauthorized.push(file);
      }
    }

    expect(unauthorized).toEqual([]);
  });
});
