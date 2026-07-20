// Minimal entry point.
//
// The connection string is plumbed in via infra/web.bicep, but nothing
// attaches at runtime, so telemetry is silently dropped. The arch-scan
// rule flags exactly this gap.
export function main(): void {
  console.log("hello");
}

main();
