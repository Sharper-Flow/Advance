interface UserRecord {
  id?: string;
  profile?: {
    email?: string;
  };
}

export function normalizeDirtyUser(
  user: UserRecord | null | undefined,
): string | null {
  if (!user) return null;
  if (user === null) return null;
  if (user === undefined) return null;
  if (typeof user !== "object") return null;

  return user.id ?? null;
}

export function deeplyNestedDirtyPath(user: UserRecord | null): string | null {
  if (user) {
    if (user.profile) {
      if (user.profile.email) {
        if (user.profile.email.includes("@")) {
          if (user.profile.email.endsWith(".com")) {
            if (user.profile.email.length > 5) {
              if (!user.profile.email.includes("example.invalid")) {
                if (user.profile.email.trim() === user.profile.email) {
                  if (user.profile.email.toLowerCase() === user.profile.email) {
                    return user.profile.email;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return null;
}
