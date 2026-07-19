export async function waitForQueryPredicate<T>(
  query: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<T | undefined> {
  const attempts = opts.attempts ?? 60;
  const delayMs = opts.delayMs ?? 500;
  let latest: T | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    latest = await query();
    if (predicate(latest)) return latest;
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return latest;
}
