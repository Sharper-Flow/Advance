/** Return true when `candidate` equals `root` or is contained under it. */
export function isSameOrChildPath(candidate: string, root: string): boolean {
  const normalizedCandidate = candidate.replace(/\/+$/, "");
  const normalizedRoot = root.replace(/\/+$/, "");
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}
