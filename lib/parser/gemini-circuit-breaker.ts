/**
 * Lightweight in-memory circuit breakers for Gemini API calls.
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
 *
 * Why a factory + per-feature circuits?
 * ──────────────────────────────────────
 * Originally a single module-level circuit was shared between PDF parsing
 * (`parseStatementWithLLM`) and the categorization fallback. That coupled
 * the two budgets — three failed parse calls would block categorization
 * even when categorization itself was healthy. CLOSEOUT-F2-T2 splits them:
 *
 *   - parseCircuit       — guards parseStatementWithLLM (heavyweight calls).
 *   - categorizeCircuit  — guards llmCategorizeBatch (lightweight calls).
 *
 * Default exports (`guardCircuit`, `onSuccess`, `onFailure`,
 * `getCircuitState`, `_resetCircuit`, `CircuitOpenError`) preserve the
 * pre-factory API and point at parseCircuit for backward compatibility
 * with `lib/parser/llm-parse.ts` and the existing test suite.
 */

/** How many consecutive Gemini failures trip the breaker. */
const FAILURE_THRESHOLD = 3;

/** How long the circuit stays OPEN before allowing a probe (ms). */
const RECOVERY_TIMEOUT_MS = 60_000; // 1 minute

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ─── Public error class ──────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  /** Label of the circuit that was open (`parse` | `categorize`). */
  readonly circuit: string;

  constructor(circuit = 'gemini') {
    super(`Gemini API temporarily unavailable — ${circuit} circuit breaker OPEN`);
    this.name = 'CircuitOpenError';
    this.circuit = circuit;
  }
}

export interface CircuitBreaker {
  readonly label: string;
  guard(): void;
  onSuccess(): void;
  onFailure(): void;
  getState(): CircuitState;
  /** @internal — for tests only */
  _reset(): void;
}

/**
 * Creates an isolated circuit breaker. Each call returns a fresh instance
 * with its own state slot — perfect for separating per-feature budgets.
 */
export function createCircuitBreaker(label: string): CircuitBreaker {
  let state: CircuitState = 'CLOSED';
  let consecutiveFailures = 0;
  let openedAt: number | null = null;

  return {
    label,
    guard(): void {
      if (state === 'CLOSED') return;

      if (state === 'OPEN') {
        if (openedAt !== null && Date.now() - openedAt >= RECOVERY_TIMEOUT_MS) {
          // Allow a single probe request through.
          state = 'HALF_OPEN';
          return;
        }
        throw new CircuitOpenError(label);
      }
      // HALF_OPEN — allow the probe request through without throwing.
    },
    onSuccess(): void {
      consecutiveFailures = 0;
      openedAt = null;
      state = 'CLOSED';
    },
    onFailure(): void {
      consecutiveFailures += 1;
      if (state === 'HALF_OPEN' || consecutiveFailures >= FAILURE_THRESHOLD) {
        state = 'OPEN';
        openedAt = Date.now();
      }
    },
    getState(): CircuitState {
      return state;
    },
    _reset(): void {
      state = 'CLOSED';
      consecutiveFailures = 0;
      openedAt = null;
    },
  };
}

// ─── Pre-built circuits per feature ──────────────────────────────────────────

/** Circuit guarding `parseStatementWithLLM` (the heavyweight PDF→JSON call). */
export const parseCircuit = createCircuitBreaker('parse');

/** Circuit guarding `llmCategorizeBatch` (the lightweight categorize call). */
export const categorizeCircuit = createCircuitBreaker('categorize');

// ─── Backwards-compatible default API (parseCircuit) ─────────────────────────
//
// Pre-existing callers (`lib/parser/llm-parse.ts`, existing tests) treat
// this module as a single-circuit shim. Keep those exports stable so the
// refactor stays surgical: lib/parser/llm-parse keeps importing the same
// names and the gemini-circuit-breaker test file continues to exercise the
// parse circuit.

/**
 * Call **before** every Gemini parse request.
 * Throws `CircuitOpenError` if the parse circuit is open.
 */
export function guardCircuit(): void {
  parseCircuit.guard();
}

/** Call after a **successful** parse response. */
export function onSuccess(): void {
  parseCircuit.onSuccess();
}

/** Call after a **failed** parse request (including retries exhausted). */
export function onFailure(): void {
  parseCircuit.onFailure();
}

/** Snapshot for logging and testing the parse circuit. */
export function getCircuitState(): CircuitState {
  return parseCircuit.getState();
}

/**
 * Reset the parse circuit to CLOSED — for tests only; do not call in
 * production code.
 * @internal
 */
export function _resetCircuit(): void {
  parseCircuit._reset();
}
