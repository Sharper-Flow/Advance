interface UserRecord {
  id?: string;
  profile?: {
    email?: string;
  };
}

export function normalizeDirtyUser(
  user: UserRecord | null | undefined,
): string | null {
  // DIRTY_REDUNDANT_GUARD_CHAIN
  if (!user) return null;
  if (user === null) return null;
  if (user === undefined) return null;
  if (typeof user !== "object") return null;

  return user.id ?? null;
}

export function deeplyNestedDirtyPath(user: UserRecord | null): string | null {
  // DIRTY_DEEP_NESTING
  if (user) {
    if (user.profile) {
      if (user.profile.email) {
        if (user.profile.email.includes("@")) {
          if (user.profile.email.endsWith(".com")) {
            return user.profile.email.toLowerCase();
          }
        }
      }
    }
  }

  return null;
}
