export function inferChangeIdFromBranch(branch: string): string | undefined {
  const prefix = "change/";
  if (!branch.startsWith(prefix)) return undefined;
  const suffix = branch.slice(prefix.length);
  return suffix.length > 0 ? suffix : undefined;
}
