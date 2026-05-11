export interface GitRemoteRepo {
  owner: string;
  name: string;
}

const GITHUB_HOST = "github.com";

/**
 * rq-repoFilter01: parse a GitHub origin remote into owner + bare repo name
 * for first-run repository_filter bootstrap. Unsupported or ambiguous remotes
 * return null instead of guessing.
 */
export function parseGitRemoteUrl(url: string): GitRemoteRepo | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const scpLike = /^git@github\.com:([^/]+)\/(?<repo>[^/]+?)\/?$/.exec(trimmed);
  if (scpLike) {
    return normalizeRepoParts(scpLike[1], scpLike.groups?.repo);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== GITHUB_HOST) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    return normalizeRepoParts(parts[0], parts[1]);
  } catch {
    return null;
  }
}

function normalizeRepoParts(
  owner: string | undefined,
  name: string | undefined,
): GitRemoteRepo | null {
  if (!owner || !name) return null;
  const normalizedName = name.endsWith(".git") ? name.slice(0, -4) : name;
  if (!normalizedName) return null;
  return { owner, name: normalizedName };
}
