import { describe, expect, test } from "vitest";
import { parseGitRemoteUrl } from "./git-remote";

describe("parseGitRemoteUrl", () => {
  test.each([
    [
      "git@github.com:Sharper-Flow/PokeEdge-Web.git",
      "Sharper-Flow",
      "PokeEdge-Web",
    ],
    [
      "https://github.com/Sharper-Flow/PokeEdge-Web.git",
      "Sharper-Flow",
      "PokeEdge-Web",
    ],
    [
      "ssh://git@github.com/Sharper-Flow/PokeEdge-Web.git",
      "Sharper-Flow",
      "PokeEdge-Web",
    ],
    [
      "https://github.com/Sharper-Flow/PokeEdge-Web",
      "Sharper-Flow",
      "PokeEdge-Web",
    ],
  ])("parses %s", (url, owner, name) => {
    expect(parseGitRemoteUrl(url)).toEqual({ owner, name });
  });

  test.each([
    "",
    "not a url",
    "git@github.com:Sharper-Flow.git",
    "https://github.com/Sharper-Flow",
    "https://gitlab.com/Sharper-Flow/PokeEdge-Web.git",
  ])("returns null for unsupported remote %s", (url) => {
    expect(parseGitRemoteUrl(url)).toBeNull();
  });
});
