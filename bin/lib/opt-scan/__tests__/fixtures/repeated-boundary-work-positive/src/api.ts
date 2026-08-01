/**
 * Positive fixture: repeated boundary work inside a loop.
 */
export async function loadUsers(ids: number[]): Promise<unknown[]> {
  const users: unknown[] = [];
  for (const id of ids) {
    const res = await fetch(`/api/users/${id}`);
    users.push(await res.json());
  }
  return users;
}
