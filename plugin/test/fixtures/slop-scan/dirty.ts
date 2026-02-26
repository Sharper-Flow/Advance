export function processUser(user: any) {
  if (!user) return null;
  if (user === null) return null;
  if (user === undefined) return null;
  if (typeof user !== "object") return null;

  if (user.data) {
    if (user.data.items) {
      if (user.data.items.length > 0) {
        if (user.data.items[0].meta) {
          if (user.data.items[0].meta.enabled) {
            return user.data.items[0].meta.value;
          }
        }
      }
    }
  }

  return null;
}
