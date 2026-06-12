import { relative } from "path";

export function toRepoRelative(filePath: string, repoRoot: string): string {
  if (!filePath) return filePath;
  const rel = relative(repoRoot, filePath);
  if (!rel.startsWith("..") && rel !== "") return rel;
  return filePath;
}

export function parseFirstNumber(text: string): number | null {
  const match = text.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : null;
}
