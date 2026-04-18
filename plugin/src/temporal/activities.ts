export async function recordTemporalFoundationEvent(input: {
  scope: "change" | "project";
  id: string;
}): Promise<{ scope: "change" | "project"; id: string; recordedAt: string }> {
  return {
    ...input,
    recordedAt: new Date().toISOString(),
  };
}
