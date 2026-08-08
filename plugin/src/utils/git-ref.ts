/**
 * Validate a local Git branch/ref name before passing it to a Git subprocess.
 *
 * This intentionally accepts ordinary local branch names only, not revision
 * expressions. Deletion paths must never reinterpret caller input as a range,
 * reflog selector, or command option.
 */
export function isValidGitBranchRef(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/"))
    return false;
  if (
    name.includes("//") ||
    name.includes("@{") ||
    name.includes("..") ||
    name.startsWith(".") ||
    name.endsWith(".") ||
    name.endsWith(".lock")
  )
    return false;
  // eslint-disable-next-line no-control-regex -- control character detection is intentional for security
  return !/[\x00-\x1f\x7f ~^:?*[\]\\;&|`$()]/.test(name);
}
