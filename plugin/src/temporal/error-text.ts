export function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      parts.push(current.name);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}
