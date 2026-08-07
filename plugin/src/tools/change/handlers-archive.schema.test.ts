import { describe, expect, it } from "vitest";
import { z } from "zod";

import { archiveChangeTools } from "./handlers-archive";

describe("adv_change_archive arguments", () => {
  const schema = z.object(archiveChangeTools.adv_change_archive.args);

  it("accepts a string target_path used by the archive handler", () => {
    expect(
      schema.safeParse({
        changeId: "archive-me",
        target_path: "/tmp/target-project",
        target_confirmed: true,
        confirmationEvidence: "user approved archive",
      }).success,
    ).toBe(true);
  });

  it("rejects the obsolete nested target_path shape", () => {
    expect(
      schema.safeParse({
        changeId: "archive-me",
        target_path: { target_path: "/tmp/target-project" },
      }).success,
    ).toBe(false);
  });
});
