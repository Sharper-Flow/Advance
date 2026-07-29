/**
 * rq-doctorConsolidation01 (tk-dc21b6a3658d, design D5 / SC2 / SC4 / AC8 / AC9)
 *
 * adv_doctor consolidates the SAFE subset of infrastructure recovery into a
 * single diagnose→safe-fix→verify entry point. Unsafe escalations (wrong-type
 * SAs, suspect lock reclaim, ambiguous ownership) refuse with typed approval-
 * required proposals instead of auto-fixing.
 *
 * These tests cover the doctor's classification + safe-fix matrix at the
 * tool-boundary level. Primitive behaviors (STSL reinit, SA registration,
 * worker restart) are mocked — their internal correctness is covered by
 * their own test suites.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { doctorTools, setDoctorPointerRepairProvider } from "./doctor";
import type { Store } from "../storage/store";

// ── Primitive mocks ──────────────────────────────────────────────────────
const reinitStslMock = vi.hoisted(() => vi.fn());
const getStslStatsMock = vi.hoisted(() => vi.fn());
const getServiceMock = vi.hoisted(() => vi.fn());
const getTemporalHealthMock = vi.hoisted(() => vi.fn());
const checkAdvSearchAttributesMock = vi.hoisted(() => vi.fn());
const registerMissingAdvSearchAttributesMock = vi.hoisted(() => vi.fn());
const restartCurrentProjectTemporalWorkerMock = vi.hoisted(() => vi.fn());
const getTemporalWorkerDiagnosticsMock = vi.hoisted(() => vi.fn());
const getTemporalWorkerAlivenessMock = vi.hoisted(() => vi.fn());
const getOrphanQueueAdoptionStatusMock = vi.hoisted(() => vi.fn());
const probeTaskQueuePollersMock = vi.hoisted(() => vi.fn());
const getProjectIdMock = vi.hoisted(() => vi.fn());

vi.mock("../temporal/service", () => ({
  getService: getServiceMock,
  getStslStats: getStslStatsMock,
  reinitStsl: reinitStslMock,
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: getTemporalHealthMock,
}));

vi.mock("../temporal/observability", () => ({
  buildTemporalSearchAttributes: vi.fn(() => ({})),
  checkAdvSearchAttributes: checkAdvSearchAttributesMock,
  registerMissingAdvSearchAttributes: registerMissingAdvSearchAttributesMock,
}));

vi.mock("../plugin-init", () => ({
  ensureProjectTemporalQueue: vi.fn(),
  getRegisteredTemporalWorkerQueues: vi.fn(() => []),
  getTemporalWorkerAliveness: getTemporalWorkerAlivenessMock,
  getTemporalWorkerDiagnostics: getTemporalWorkerDiagnosticsMock,
  getOrphanQueueAdoptionStatus: getOrphanQueueAdoptionStatusMock,
  restartCurrentProjectTemporalWorker: restartCurrentProjectTemporalWorkerMock,
}));

vi.mock("../temporal/queue-serviceability", () => ({
  classifyQueueServiceability: vi.fn(),
  probeTaskQueuePollers: probeTaskQueuePollersMock,
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: getProjectIdMock,
}));

const probeChangePhantomStatusMock = vi.hoisted(() => vi.fn());

vi.mock("./_adapters", () => ({
  isChangeReachable: vi.fn(),
  probeChangePhantomStatus: probeChangePhantomStatusMock,
  ReachabilityDeps: {},
}));

function makeStore(): Store {
  return {
    paths: {
      root: "/tmp/project",
      changes: "/tmp/changes",
      external: "/tmp/x",
    },
  } as unknown as Store;
}

function setHealthy() {
  getServiceMock.mockReturnValue({
    client: { workflow: { getHandle: vi.fn() } },
    connection: {},
    namespace: "default",
  });
  getTemporalHealthMock.mockResolvedValue({
    server_alive: true,
    worker_alive: true,
    worker_process_alive: true,
    registered_queues: ["advance-pid"],
    last_op_at: "2026-07-22T00:00:00.000Z",
    last_error: null,
    fallback_counts: {},
    stale_queues: [],
    reconnect_count: 0,
    op_counters: [],
    worker_lock: null,
    last_worker_run_error: null,
    server_poller_probe: {
      status: "fresh",
      lastAccessMs: 100,
      pollerCount: 2,
      lastPollerAt: "2026-07-22T00:00:00.000Z",
    },
    queues: [
      {
        queueName: "advance-pid",
        queueType: "project",
        serviceable: true,
        pollerCount: 2,
        lastPollerAt: "2026-07-22T00:00:00.000Z",
      },
    ],
  });
  getTemporalWorkerDiagnosticsMock.mockReturnValue([
    {
      kind: "out_of_process",
      queues: ["advance-pid"],
      failedQueues: [],
      alive: true,
      diagnostics: [
        {
          queue: "advance-pid",
          dead: false,
          restartCount: 0,
          childExitCode: null,
          childPid: 123,
          childRunning: true,
        },
      ],
    },
  ]);
  getOrphanQueueAdoptionStatusMock.mockReturnValue({
    enabled: false,
    diagnostics: null,
    reason: "no_worker_attached",
  });
  getTemporalWorkerAlivenessMock.mockReturnValue(false);
  checkAdvSearchAttributesMock.mockResolvedValue({
    ok: true,
    present: [{ name: "AdvChangeId" }, { name: "AdvChangeStatus" }],
    missing: [],
    wrongType: [],
  });
  getStslStatsMock.mockReturnValue({
    reconnectCount: 0,
    reconnectFailureCount: 0,
  });
  getProjectIdMock.mockReturnValue("pid");
  probeTaskQueuePollersMock.mockResolvedValue({
    status: "fresh",
    pollerCount: 2,
    lastPollerAt: "2026-07-22T00:00:00.000Z",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setHealthy();
});

describe("adv_doctor", () => {
  test("description names itself as the one diagnostic entry point (AC8)", () => {
    expect(doctorTools.adv_doctor.description).toMatch(/diagnose/i);
    expect(doctorTools.adv_doctor.description).toMatch(
      /safe fix|safe-fix|safe repair/i,
    );
    expect(doctorTools.adv_doctor.description).toMatch(/verify/i);
  });

  test("healthy system: no fixes applied, no refusals, returns verified=true", async () => {
    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ class: "healthy" })]),
    );
    expect(parsed.fixes_applied).toEqual([]);
    expect(parsed.fixes_refused).toEqual([]);
    expect(parsed.verification.healthy).toBe(true);
  });

  test("AC4: worker alive but adoption unavailable adds unhealthy finding", async () => {
    getTemporalWorkerAlivenessMock.mockReturnValue(true);
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: false,
      diagnostics: null,
      reason: "no_temporal_client",
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "unhealthy",
          finding: "orphan_queue_adoption_not_active",
          detail: "no_temporal_client",
        }),
      ]),
    );
  });

  test("AC4: driver_error reason is also flagged as unhealthy", async () => {
    getTemporalWorkerAlivenessMock.mockReturnValue(true);
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: false,
      diagnostics: null,
      reason: "driver_error: tick failure",
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "unhealthy",
          finding: "orphan_queue_adoption_not_active",
        }),
      ]),
    );
  });

  test("AC4: kill_switch is not flagged as unhealthy", async () => {
    getTemporalWorkerAlivenessMock.mockReturnValue(true);
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: false,
      diagnostics: null,
      reason: "kill_switch",
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ class: "unhealthy" })]),
    );
  });

  test("AC5: no worker alive with no adoption is healthy (no adoption-related unhealthy finding)", async () => {
    getTemporalWorkerAlivenessMock.mockReturnValue(false);
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: false,
      diagnostics: null,
      reason: "no_worker_attached",
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ class: "unhealthy" })]),
    );
  });

  test("renders disabled orphan-queue adoption when no adopter is active", async () => {
    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.orphan_queue_adoption).toEqual({
      enabled: false,
      reason: "no_worker_attached",
      note: "orphan-queue adoption: disabled (no active adopter)",
    });
  });

  test("renders populated orphan-queue adoption diagnostics", async () => {
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: true,
      diagnostics: {
        scanInFlight: true,
        scanFailureCount: 0,
        consecutiveScanFailures: 0,
        lastScanStartedAt: Date.now(),
        lastScanDurationMs: 12,
        suppressedShutdownCount: 0,
        trackedQueues: [
          {
            queue: "sess_opaque",
            attemptCount: 2,
            lastAttemptAt: 100,
            cooldownUntil: 200,
            inCooldown: true,
          },
        ],
      },
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.orphan_queue_adoption).toEqual({
      enabled: true,
      scanInFlight: true,
      health: "ok",
      scanFailureCount: 0,
      consecutiveScanFailures: 0,
      lastScanStartedAt: expect.any(Number),
      lastScanDurationMs: 12,
      suppressedShutdownCount: 0,
      trackedQueues: [
        {
          queue: "sess_opaque",
          attemptCount: 2,
          lastAttemptAt: 100,
          cooldownUntil: 200,
          inCooldown: true,
        },
      ],
      omittedTrackedQueues: 0,
    });
  });

  test("reports UNHEALTHY when adoption scans are repeatedly failing (#327)", async () => {
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: true,
      diagnostics: {
        scanInFlight: false,
        scanFailureCount: 9,
        consecutiveScanFailures: 4,
        lastScanError: "1 CANCELLED: context canceled",
        lastScanStartedAt: Date.now(),
        lastScanDurationMs: 8000,
        suppressedShutdownCount: 0,
        trackedQueues: [],
      },
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    // The regression that mattered: doctor previously said "healthy" here.
    expect(parsed.orphan_queue_adoption.health).toBe("failing_scans");
    expect(
      parsed.findings.some(
        (f: { class: string }) => f.class === "orphan_queue_adoption_degraded",
      ),
    ).toBe(true);
    expect(
      parsed.findings.some((f: { class: string }) => f.class === "healthy"),
    ).toBe(false);
    expect(parsed.success).toBe(false);
  });

  test("reports UNHEALTHY when an adoption scan is stuck in flight (#327)", async () => {
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: true,
      diagnostics: {
        // The exact #327 fingerprint: latch held, counter frozen at zero.
        scanInFlight: true,
        scanFailureCount: 0,
        consecutiveScanFailures: 0,
        lastScanStartedAt: Date.now() - 120_000,
        lastScanDurationMs: 0,
        suppressedShutdownCount: 0,
        trackedQueues: [],
      },
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.orphan_queue_adoption.health).toBe("stuck_scan");
    const degraded = parsed.findings.find(
      (f: { class: string }) => f.class === "orphan_queue_adoption_degraded",
    );
    expect(degraded).toBeDefined();
    expect(degraded.finding).toBe("stuck_scan");
    expect(degraded.detail).toMatch(/unreachable/i);
    expect(parsed.success).toBe(false);
  });

  test("caps displayed orphan-queue diagnostics at 50 entries", async () => {
    getOrphanQueueAdoptionStatusMock.mockReturnValue({
      enabled: true,
      diagnostics: {
        scanInFlight: false,
        trackedQueues: Array.from({ length: 52 }, (_, index) => ({
          queue: `sess_${index}`,
          attemptCount: 3,
          lastAttemptAt: index,
          cooldownUntil: 0,
          inCooldown: false,
        })),
      },
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(parsed.orphan_queue_adoption.trackedQueues).toHaveLength(50);
    expect(parsed.orphan_queue_adoption.omittedTrackedQueues).toBe(2);
  });

  test("stale transport (server_alive=false): reinitStsl fires once and is recorded as a bounded fix", async () => {
    getTemporalHealthMock.mockResolvedValueOnce({
      ...({} as never),
      server_alive: false,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: null,
      last_error: "connection refused",
      fallback_counts: {},
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
      server_poller_probe: {
        status: "unavailable",
        lastAccessMs: 0,
        pollerCount: 0,
        lastPollerAt: null,
      },
      queues: [],
    });
    // After fix, health comes back healthy.
    reinitStslMock.mockResolvedValue(undefined);

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(reinitStslMock).toHaveBeenCalledTimes(1);
    expect(parsed.fixes_applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "stale_transport",
          action: "stsl_reinit",
          outcome: "applied",
        }),
      ]),
    );
    // Bounded repair evidence per AC9.
    const fix = parsed.fixes_applied.find(
      (f: { class: string }) => f.class === "stale_transport",
    );
    expect(fix.before).toBeDefined();
    expect(fix.after).toBeDefined();
  });

  test("missing search attributes: registered via the safe subset (missing-only, no wrong-type mutation)", async () => {
    checkAdvSearchAttributesMock.mockResolvedValueOnce({
      ok: false,
      present: [{ name: "AdvChangeId" }],
      missing: [{ name: "AdvChangeStatus" }],
      wrongType: [],
    });
    registerMissingAdvSearchAttributesMock.mockResolvedValueOnce({
      ok: true,
      created: [{ name: "AdvChangeStatus" }],
      error: null,
      verificationStatus: "verified",
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(registerMissingAdvSearchAttributesMock).toHaveBeenCalledTimes(1);
    expect(parsed.fixes_applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "missing_search_attributes",
          action: "register_missing",
          outcome: "applied",
        }),
      ]),
    );
  });

  test("worker_down (exclusively owned, no suspect lock): restart fires and verification follows", async () => {
    // Worker alive=false but lock is free (no suspect lock); doctor can safely restart.
    getTemporalHealthMock.mockResolvedValue({
      ...({} as never),
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: "2026-07-22T00:00:00.000Z",
      last_error: null,
      fallback_counts: {},
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
      server_poller_probe: {
        status: "unavailable",
        lastAccessMs: 0,
        pollerCount: 0,
        lastPollerAt: null,
      },
      queues: [],
    });
    restartCurrentProjectTemporalWorkerMock.mockResolvedValue({
      projectId: "pid",
      expectedQueue: "advance-pid",
      queues: ["advance-pid"],
    });
    // Post-restart verification: worker is now alive.
    getTemporalWorkerDiagnosticsMock.mockReturnValue([
      {
        kind: "out_of_process",
        queues: ["advance-pid"],
        failedQueues: [],
        alive: true,
        diagnostics: [
          {
            queue: "advance-pid",
            dead: false,
            restartCount: 0,
            childExitCode: null,
            childPid: 124,
            childRunning: true,
          },
        ],
      },
    ]);

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(restartCurrentProjectTemporalWorkerMock).toHaveBeenCalledWith(
      "/tmp/project",
      expect.objectContaining({ approvedLockReclaim: false }),
    );
    expect(parsed.fixes_applied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "worker_down_owned",
          action: "worker_restart",
          outcome: "applied",
        }),
      ]),
    );
  });

  test("wrong-type search attributes: REFUSED with typed approval-required proposal (never auto-mutates)", async () => {
    checkAdvSearchAttributesMock.mockResolvedValue({
      ok: false,
      present: [{ name: "AdvChangeId" }],
      missing: [],
      wrongType: [
        { name: "AdvChangeStatus", expectedType: "Keyword", actualType: "Int" },
      ],
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(registerMissingAdvSearchAttributesMock).not.toHaveBeenCalled();
    expect(parsed.fixes_refused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "wrong_type_search_attributes",
          outcome: "approval_required",
          proposal: expect.any(String),
        }),
      ]),
    );
  });

  test("suspect worker.lock (live lock, not owned): REFUSED — operator must explicitly approve reclaim", async () => {
    getTemporalHealthMock.mockResolvedValue({
      ...({} as never),
      server_alive: true,
      worker_alive: false,
      worker_process_alive: false,
      registered_queues: [],
      last_op_at: "2026-07-22T00:00:00.000Z",
      last_error: null,
      fallback_counts: {},
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: {
        pid: 99999,
        kind: "v2",
        acquiredAt: "2026-07-22T00:00:00.000Z",
        live: true,
        owned: false,
      },
      last_worker_run_error: null,
      server_poller_probe: {
        status: "unavailable",
        lastAccessMs: 0,
        pollerCount: 0,
        lastPollerAt: null,
      },
      queues: [],
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);

    expect(restartCurrentProjectTemporalWorkerMock).not.toHaveBeenCalled();
    expect(parsed.fixes_refused).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          class: "suspect_lock",
          outcome: "approval_required",
        }),
      ]),
    );
  });

  test("doctor never accepts approval fields in args (no bypass path)", () => {
    // Doctor is the SAFE entry point. Unsafe escalations return proposals,
    // never get auto-approved via an arg-side loophole.
    const argsSchema = doctorTools.adv_doctor.args;
    expect(argsSchema).not.toHaveProperty("approvedLockReclaim");
    expect(argsSchema).not.toHaveProperty("approvedByUser");
  });

  test("refusal carries a typed proposal pointing to the specific operator action", async () => {
    checkAdvSearchAttributesMock.mockResolvedValue({
      ok: false,
      present: [],
      missing: [],
      wrongType: [
        { name: "AdvChangeId", expectedType: "Keyword", actualType: "Text" },
      ],
    });

    const result = await doctorTools.adv_doctor.execute({}, makeStore());
    const parsed = JSON.parse(result);
    const refusal = parsed.fixes_refused[0];
    expect(refusal.proposal).toMatch(/operator/i);
    expect(refusal.operator_action).toBeTypeOf("string");
    expect(refusal.operator_action.length).toBeGreaterThan(0);
  });

  // rq-activeChangePointer01 / rq-doctorConsolidation01 — phantom pointer
  // safe-fix (replaces retired adv_change_forget per option B / design D6).
  describe("phantom_pointer safe-fix (rq-doctorConsolidation01 option B)", () => {
    const pointerProvider = {
      getActivePointer: vi.fn(),
      clearActivePointer: vi.fn(),
    };

    beforeEach(() => {
      pointerProvider.getActivePointer.mockReset();
      pointerProvider.clearActivePointer.mockReset();
      setDoctorPointerRepairProvider(pointerProvider);
      probeChangePhantomStatusMock.mockReset();
    });

    afterEach(() => {
      // Always reset the provider so other tests see null (tests/MCP shape).
      setDoctorPointerRepairProvider(null);
    });

    test("confirmed_absent: clears pointer and records fix with evidence", async () => {
      pointerProvider.getActivePointer.mockReturnValue("phantomChange");
      probeChangePhantomStatusMock.mockResolvedValue({
        status: "confirmed_absent",
        evidence: "disk absent + Visibility not-found",
      });

      const result = await doctorTools.adv_doctor.execute({}, makeStore());
      const parsed = JSON.parse(result);

      expect(pointerProvider.clearActivePointer).toHaveBeenCalledTimes(1);
      expect(parsed.fixes_applied).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            class: "phantom_pointer",
            action: "clear_session_pointer",
            outcome: "applied",
          }),
        ]),
      );
    });

    test("confirmed_present: no fix applied, no pointer clear (pointer is valid)", async () => {
      pointerProvider.getActivePointer.mockReturnValue("validChange");
      probeChangePhantomStatusMock.mockResolvedValue({
        status: "confirmed_present",
        evidence: "disk present",
      });

      const result = await doctorTools.adv_doctor.execute({}, makeStore());
      const parsed = JSON.parse(result);

      expect(pointerProvider.clearActivePointer).not.toHaveBeenCalled();
      expect(
        parsed.fixes_applied.find(
          (f: { class: string }) => f.class === "phantom_pointer",
        ),
      ).toBeUndefined();
    });

    test("indeterminate: REFUSED with typed proposal (never clears on ambiguous probe)", async () => {
      pointerProvider.getActivePointer.mockReturnValue("ambiguousChange");
      probeChangePhantomStatusMock.mockResolvedValue({
        status: "indeterminate",
        evidence: "Visibility timeout; disk check threw EACCES",
      });

      const result = await doctorTools.adv_doctor.execute({}, makeStore());
      const parsed = JSON.parse(result);

      expect(pointerProvider.clearActivePointer).not.toHaveBeenCalled();
      expect(parsed.fixes_refused).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            class: "phantom_pointer",
            outcome: "approval_required",
          }),
        ]),
      );
    });

    test("no active pointer: skips phantom check entirely (no probe call)", async () => {
      pointerProvider.getActivePointer.mockReturnValue(null);

      await doctorTools.adv_doctor.execute({}, makeStore());

      expect(probeChangePhantomStatusMock).not.toHaveBeenCalled();
      expect(pointerProvider.clearActivePointer).not.toHaveBeenCalled();
    });

    test("no pointer-repair provider (tests/MCP): skips phantom check entirely", async () => {
      setDoctorPointerRepairProvider(null);

      await doctorTools.adv_doctor.execute({}, makeStore());

      expect(probeChangePhantomStatusMock).not.toHaveBeenCalled();
    });
  });
});
