import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowsPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "workflows.ts",
);

const disallowedLauncherActivityNames = [
  "buildLauncherProjection",
  "writeLauncherProjection",
  "rebuildLauncherProjection",
  "launcherProjection",
];

const expectedActivityProxyNames = [
  "archiveChangeActivity",
  "inspectArtifactActivity",
  "writeArtifactActivity",
  "writeChangeProjection",
];

describe("workflow activity sequence guard (AC3 / DDC6)", () => {
  it("does not add a new launcher-aggregate activity call to workflows.ts", () => {
    const source = readFileSync(workflowsPath, "utf-8");

    for (const name of disallowedLauncherActivityNames) {
      expect(source).not.toContain(name);
    }

    // The aggregate write is intentionally inside the host-side activity body
    // of writeChangeProjection; the workflow must not gain a new awaited
    // activity. Confirm the activity proxy destructuring still only references
    // the pre-existing projection activities.
    const proxyMatch = source.match(
      /const\s*\{\s*([\s\S]*?)\s*\}\s*=\s*wf\.proxyActivities\s*<\s*ChangeProjectionActivities\s*>\s*\(/,
    );
    expect(proxyMatch).toBeTruthy();
    const proxyBlock = proxyMatch?.[1] ?? "";
    for (const name of expectedActivityProxyNames) {
      expect(proxyBlock).toContain(name);
    }
    expect(proxyBlock.match(/\b\w+\b/g) ?? []).toHaveLength(
      expectedActivityProxyNames.length,
    );
  });
});
