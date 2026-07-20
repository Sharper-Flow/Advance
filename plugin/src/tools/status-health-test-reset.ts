/**
 * Single deterministic reset surface for all module-level status-health test
 * caches. Keep module-specific clearing functions private to their owner.
 */
import { resetStatusHealthModuleForTest } from "./status-health";
import { _healthRequestProbeCaches } from "./status-health-plan";

/** Exported for test isolation only. */
export function resetStatusHealthForTest(): void {
  resetStatusHealthModuleForTest();
  _healthRequestProbeCaches.clear();
}
