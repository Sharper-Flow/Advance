import { getTemporalNamespace } from "../src/temporal/client";

const LIVE_TEMPORAL_NAMESPACE = "default";

/**
 * Resolve the namespace reserved for replay-fixture generation.
 *
 * Fixture generation starts real workflows and therefore must never fall back
 * to ADV's production/default namespace. Requiring an explicit namespace also
 * makes the isolation decision visible at the command boundary.
 */
export function getReplayFixtureNamespace(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = (env.REPLAY_FIXTURE_NAMESPACE ?? "").trim();
  if (!configured) {
    throw new Error(
      "Refusing to generate replay fixtures without REPLAY_FIXTURE_NAMESPACE; configure an explicitly isolated Temporal namespace",
    );
  }

  const namespace = getTemporalNamespace({
    ADV_TEMPORAL_NAMESPACE: configured,
  });
  if (namespace.toLowerCase() === LIVE_TEMPORAL_NAMESPACE) {
    throw new Error(
      `Refusing to generate replay fixtures in the live Temporal namespace "${namespace}"; use an explicitly isolated namespace via REPLAY_FIXTURE_NAMESPACE`,
    );
  }
  return namespace;
}
