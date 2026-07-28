import { describe, expect, test } from "vitest";
import {
  ChangeSchema,
  mapConventionalCommitToReleaseNoteCategory,
  ReleaseNotesArchiveEnvelopeSchema,
  ReleaseNotesContentSchema,
} from "./changes";

const RELEASE_NOTES_ENVELOPE_MAX_BYTES = 32768;

const validContent = {
  audience: "external",
  category: "added",
  headline_external: "Adds release-note content schemas",
  area: "schema-registry",
  user_action_required: false,
};

const minimalChange = {
  id: "addReleaseNotesData",
  title: "Add release notes data schemas",
  status: "draft",
  created_at: "2026-07-28T00:00:00Z",
};

describe("ReleaseNotesContentSchema", () => {
  test("accepts minimal valid content", () => {
    const parsed = ReleaseNotesContentSchema.parse(validContent);
    expect(parsed.audience).toBe("external");
    expect(parsed.category).toBe("added");
  });

  test("rejects missing audience", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({ category: "added" }),
    ).toThrow();
  });

  test("rejects missing category", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({ audience: "external" }),
    ).toThrow();
  });

  test("rejects invalid audience", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({
        audience: "public",
        category: "added",
      }),
    ).toThrow();
  });

  test("rejects invalid category", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({
        audience: "external",
        category: "feature",
      }),
    ).toThrow();
  });

  test("accepts optional bounded fields", () => {
    const parsed = ReleaseNotesContentSchema.parse({
      audience: "both",
      category: "security",
      headline_internal: "Internal note",
      headline_external: "External note",
      highlights: ["h1", "h2"],
      area: "plugin/types",
      user_action_required: true,
      breaking: {
        description: "Breaking change description",
        migration: "Migration steps",
      },
      deprecations: ["dep1"],
      links: { issue: "#1", pr: "#2" },
    });
    expect(parsed.breaking?.migration).toBe("Migration steps");
    expect(parsed.links?.issue).toBe("#1");
  });

  test("enforces narrative bounds", () => {
    const tooLong = "x".repeat(2049);
    expect(() =>
      ReleaseNotesContentSchema.parse({
        ...validContent,
        headline_external: tooLong,
      }),
    ).toThrow();
  });

  test("enforces area bound", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({
        ...validContent,
        area: "x".repeat(101),
      }),
    ).toThrow();
  });

  test("enforces migration bound", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({
        ...validContent,
        breaking: { description: "x", migration: "x".repeat(4097) },
      }),
    ).toThrow();
  });

  test("enforces collection max size", () => {
    expect(() =>
      ReleaseNotesContentSchema.parse({
        ...validContent,
        highlights: Array.from({ length: 21 }, (_, i) => `h${i}`),
      }),
    ).toThrow();
  });

  test("does not conditionally require headlines", () => {
    const parsed = ReleaseNotesContentSchema.parse({
      audience: "external",
      category: "changed",
    });
    expect(parsed.headline_external).toBeUndefined();
    expect(parsed.headline_internal).toBeUndefined();
  });
});

describe("ReleaseNotesArchiveEnvelopeSchema", () => {
  test("accepts one release-note object and rejects an array", () => {
    const envelope = {
      schema_version: "1.0",
      change_id: "addReleaseNotesData",
      title: "Add release notes data schemas",
      release_notes: validContent,
    };

    expect(
      ReleaseNotesArchiveEnvelopeSchema.parse(envelope).release_notes,
    ).toEqual(validContent);
    expect(() =>
      ReleaseNotesArchiveEnvelopeSchema.parse({
        ...envelope,
        release_notes: [validContent],
      }),
    ).toThrow();
  });

  test("accepts a valid envelope", () => {
    const envelope = {
      schema_version: "1.0",
      change_id: "addReleaseNotesData",
      title: "Add release notes data schemas",
      release_notes: validContent,
    };
    const parsed = ReleaseNotesArchiveEnvelopeSchema.parse(envelope);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.release_notes).toEqual(validContent);
  });

  test("rejects wrong schema_version", () => {
    expect(() =>
      ReleaseNotesArchiveEnvelopeSchema.parse({
        schema_version: "2.0",
        change_id: "addReleaseNotesData",
        title: "Add release notes data schemas",
        release_notes: validContent,
      }),
    ).toThrow();
  });

  test("rejects serialized envelope exceeding 32 KB", () => {
    const envelope = {
      schema_version: "1.0",
      change_id: "addReleaseNotesData",
      title: "Add release notes data schemas",
      release_notes: {
        ...validContent,
        headline_external: "x".repeat(2000),
        highlights: Array.from({ length: 20 }, () => "x".repeat(2000)),
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
    expect(bytes).toBeGreaterThan(RELEASE_NOTES_ENVELOPE_MAX_BYTES);
    expect(() => ReleaseNotesArchiveEnvelopeSchema.parse(envelope)).toThrow(
      /32768/,
    );
  });
});

describe("ChangeSchema release_notes passthrough", () => {
  test("ChangeSchema accepts optional release_notes", () => {
    const parsed = ChangeSchema.parse({
      ...minimalChange,
      release_notes: validContent,
    });
    expect(parsed.release_notes?.audience).toBe("external");
  });

  test("ChangeSchema survives legacy changes without release_notes", () => {
    const parsed = ChangeSchema.parse(minimalChange);
    expect(parsed.release_notes).toBeUndefined();
  });
});

describe("mapConventionalCommitToReleaseNoteCategory", () => {
  test("maps feat -> added", () => {
    expect(mapConventionalCommitToReleaseNoteCategory("feat")).toBe("added");
  });

  test("maps fix -> fixed", () => {
    expect(mapConventionalCommitToReleaseNoteCategory("fix")).toBe("fixed");
  });

  test("maps perf -> changed", () => {
    expect(mapConventionalCommitToReleaseNoteCategory("perf")).toBe("changed");
  });

  test("returns undefined for unmapped types", () => {
    expect(mapConventionalCommitToReleaseNoteCategory("chore")).toBeUndefined();
    expect(mapConventionalCommitToReleaseNoteCategory("docs")).toBeUndefined();
    expect(
      mapConventionalCommitToReleaseNoteCategory("refactor"),
    ).toBeUndefined();
  });
});
