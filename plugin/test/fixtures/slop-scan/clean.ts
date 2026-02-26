type User = {
  data?: {
    items?: Array<{ meta?: { enabled?: boolean; value?: string } }>;
  };
};

export function processUser(user: User | null): string | null {
  if (!user) return null;

  const first = user.data?.items?.[0];
  if (!first?.meta?.enabled) return null;

  try {
    return first.meta.value ?? null;
  } catch {
    return null;
  }
}
