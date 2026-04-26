/**
 * Lightweight in-memory circuit breaker for Gemini API calls.
 *
 * Module-level state persists across requests within a warm serverless
 * function instance, resetting on cold start.  This is acceptable for the
 * primary use-case (preventing request storms against a failing service
 * within a burst) without requiring a distributed state store.
 *
 * States
 * ──────
 *   CLOSED    Normal operation; every request passes through.
 *   OPEN      Tripped after FAILURE_THRESHOLD consecutive failures; requests
 *             are rejected immediately with CircuitOpenError.
 *   HALF_OPEN After RECOVERY_TIMEOUT_MS a single probe is allowed through.
 *             If the probe succeeds → CLOSED; if it fails → OPEN again.
 */

/** How many consecutive Gemini failures trip the breaker. */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays OPEN before allowing a probe (ms). */
const RECOVERY_TIMEOUT_MS = 60_000; // 1 minute

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

let state: CircuitState = 'CLOSED';
let consecutiveFailures = 0;
let openedAt: number | null = null;

// ─── Public error class ──────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor() {
    super('Gemini API temporarily unavailable — circuit breaker OPEN');
    this.name = 'CircuitOpenError';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Call **before** every Gemini request.
 * Throws `CircuitOpenError` if the circuit is open and the recovery timeout
 * has not yet elapsed.  Transitions OPEN → HALF_OPEN when the timeout passes.
 */
export function guardCircuit(): void {
  if (state === 'CLOSED') return;

  if (state === 'OPEN') {
    if (openedAt !== null && Date.now() - openedAt >= RECOVERY_TIMEOUT_MS) {
      // Allow a single probe request through.
      state = 'HALF_OPEN';
      return;
    }
    throw new CircuitOpenError();
  }
  // HALF_OPEN — allow the probe request through without throwing.
}

/**
 * Call after a **successful** Gemini response.
 * Resets the failure counter and closes the circuit.
 */
export function onSuccess(): void {
  consecutiveFailures = 0;
  openedAt = null;
  state = 'CLOSED';
}

/**
 * Call after a **failed** Gemini request (including retries exhausted).
 * Trips the circuit once FAILURE_THRESHOLD is reached.
 */
export function onFailure(): void {
  consecutiveFailures += 1;
  if (state === 'HALF_OPEN' || consecutiveFailures >= FAILURE_THRESHOLD) {
    state = 'OPEN';
    openedAt = Date.now();
  }
}

/** Snapshot for logging and testing. */
export function getCircuitState(): CircuitState {
  return state;
}

/**
 * Reset to CLOSED — for tests only; do not call in production code.
 * @internal
 */
export function _resetCircuit(): void {
  state = 'CLOSED';
  consecutiveFailures = 0;
  openedAt = null;
}
