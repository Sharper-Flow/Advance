import { describe, expect, test } from "bun:test";

import { buildBinResumeProjection } from "./resume-projection";

const PROJECT_ID = "bdf259aa162ae192af5b18899ccdc653b085528d";

describe("buildBinResumeProjection", () => {
  test("maps a loaded in-progress task to an active lifecycle row", () => {
    const projection = buildBinResumeProjection(
      [
        {
          id: "addDependencyAwareResume",
          title: "Dependency-aware resume",
          status: "draft",
          lifecycleState: "open",
          tasks: [{ status: "in_progress" }],
        },
      ],
      [],
      PROJECT_ID,
    );

    expect(projection.active).toHaveLength(1);
    expect(projection.active[0]).toMatchObject({
      lifecycle: "active",
      node: {
        kind: "change",
        project_id: PROJECT_ID,
        change_id: "addDependencyAwareResume",
      },
    });
  });
});
