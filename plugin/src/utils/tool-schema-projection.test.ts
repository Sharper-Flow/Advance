import { describe, expect, it } from "vitest";

import {
  parseAgentToolPermissions,
  projectToolSchemaManifest,
} from "./tool-schema-projection";

const manifest = {
  total_tools: 3,
  total_schema_bytes: 45,
  total_approx_tokens_4char_rule: 12,
  conversion_errors: 1,
  tools: {
    adv_allowed: {
      status: "available" as const,
      schema_bytes: 32,
      approx_tokens_4char_rule: 8,
    },
    adv_denied: {
      status: "available" as const,
      schema_bytes: 13,
      approx_tokens_4char_rule: 4,
    },
    adv_failed: {
      status: "conversion_error" as const,
      schema_bytes: null,
      approx_tokens_4char_rule: null,
      conversion_error: "bad",
    },
  },
};

describe("tool schema projection", () => {
  it("projects only tools allowed by OpenCode's resolved permission profile", () => {
    expect(
      projectToolSchemaManifest(manifest, {
        adv_allowed: true,
        adv_denied: false,
      }),
    ).toEqual({
      availability: "available",
      enabled_tools: 1,
      schema_bytes: 32,
      approx_tokens_4char_rule: 8,
      conversion_errors: 0,
    });
  });

  it("parses the debug-agent JSON after preceding plugin log lines", () => {
    const profile = parseAgentToolPermissions(
      '{"level":"info"}\n{\n  "name": "adv-engineer",\n  "tools": { "adv_allowed": true, "adv_denied": false }\n}',
    );
    expect(profile).toEqual({ adv_allowed: true, adv_denied: false });
  });
});
