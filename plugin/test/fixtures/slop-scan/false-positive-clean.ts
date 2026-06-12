interface RequestContext {
  userId?: string;
  headers: Record<string, string>;
}

export function parseBoundaryRequest(
  context: RequestContext | null,
): string | null {
  if (!context) return null;

  try {
    return context.userId ?? context.headers["x-user-id"] ?? null;
  } catch {
    return null;
  }
}

export const documentedExample = `example text used in scanner docs, not product code`;
