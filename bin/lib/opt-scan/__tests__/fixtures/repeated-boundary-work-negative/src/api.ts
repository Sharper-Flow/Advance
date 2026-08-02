/**
 * Negative fixture: a single boundary call with no surrounding loop.
 */
export async function loadUser(id: number): Promise<unknown> {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}
