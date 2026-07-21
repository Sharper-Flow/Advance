/**
 * MCP project_context tool handler.
 *
 * Wires `adv_project_context` through the plugin tool registry without
 * statically importing the SDK-coupled registry at module load time.
 * The store is created on-demand as a disk-only backend so the MCP server
 * never blocks on Temporal during initialization.
 */

export async function handleProjectContext(
  cwd: string,
  _args: Record<string, unknown>,
): Promise<string> {
  const { createToolMap } = await import("../../tool-registry.js");
  const { createDiskStore } = await import("../../storage/store-disk.js");

  const store = await createDiskStore(cwd);
  try {
    const tools = createToolMap(store, cwd);
    const execute = tools.adv_project_context.execute as (
      args: Record<string, unknown>,
      ctx?: unknown,
    ) => Promise<unknown>;
    const result = await execute({});
    return typeof result === "string"
      ? result
      : (result as { output: string }).output;
  } finally {
    store.close();
  }
}
