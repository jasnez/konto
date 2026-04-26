// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitOpenError,
  _resetCircuit,
  getCircuitState,
  guardCircuit,
  onFailure,
  onSuccess,
} from '../gemini-circuit-breaker';

afterEach(() => {
  _resetCircuit();
  vi.useRealTimers();
});

describe('circuit breaker — CLOSED (initial state)', () => {
  it('starts CLOSED', () => {
    expect(getCircuitState()).toBe('CLOSED');
  });

  it('guardCircuit() does not throw when CLOSED', () => {
    expect(() => {
      guardCircuit();
    }).not.toThrow();
  });

  it('onSuccess() keeps circuit CLOSED', () => {
    onSuccess();
    expect(getCircuitState()).toBe('CLOSED');
  });

  it('two failures do not trip the circuit (threshold is 3)', () => {
    onFailure();
    onFailure();
    expect(getCircuitState()).toBe('CLOSED');
    expect(() => {
      guardCircuit();
    }).not.toThrow();
  });
});

describe('circuit breaker — tripping to OPEN', () => {
  it('trips to OPEN after 3 consecutive failures', () => {
    onFailure();
    onFailure();
    onFailure();
    expect(getCircuitState()).toBe('OPEN');
  });

  it('guardCircuit() throws CircuitOpenError when OPEN', () => {
    onFailure();
    onFailure();
    onFailure();
    expect(() => {
      guardCircuit();
    }).toThrow(CircuitOpenError);
  });

  it('success resets failure counter so the circuit does not trip on failure + success + failure', () => {
    onFailure();
    onFailure();
    onSuccess(); // resets counter
    onFailure();
    onFailure();
    // still only 2 consecutive failures after reset
    expect(getCircuitState()).toBe('CLOSED');
    expect(() => {
      guardCircuit();
    }).not.toThrow();
  });
});

describe('circuit breaker — HALF_OPEN recovery', () => {
  it('transitions OPEN → HALF_OPEN after recovery timeout', () => {
    vi.useFakeTimers();
    onFailure();
    onFailure();
    onFailure();
    expect(getCircuitState()).toBe('OPEN');

    // Advance past the 60s recovery timeout.
    vi.advanceTimersByTime(61_000);

    expect(() => {
      guardCircuit();
    }).not.toThrow(); // probe allowed
    expect(getCircuitState()).toBe('HALF_OPEN');
  });

  it('probe success in HALF_OPEN → closes circuit', () => {
    vi.useFakeTimers();
    onFailure();
    onFailure();
    onFailure();
    vi.advanceTimersByTime(61_000);
    guardCircuit(); // enter HALF_OPEN
    onSuccess();
    expect(getCircuitState()).toBe('CLOSED');
    expect(() => {
      guardCircuit();
    }).not.toThrow();
  });

  it('probe failure in HALF_OPEN → re-opens circuit', () => {
    vi.useFakeTimers();
    onFailure();
    onFailure();
    onFailure();
    vi.advanceTimersByTime(61_000);
    guardCircuit(); // enter HALF_OPEN
    onFailure(); // probe fails
    expect(getCircuitState()).toBe('OPEN');
    expect(() => {
      guardCircuit();
    }).toThrow(CircuitOpenError);
  });

  it('does not transition to HALF_OPEN before recovery timeout', () => {
    vi.useFakeTimers();
    onFailure();
    onFailure();
    onFailure();

    vi.advanceTimersByTime(30_000); // only 30s — still inside timeout

    expect(() => {
      guardCircuit();
    }).toThrow(CircuitOpenError);
    expect(getCircuitState()).toBe('OPEN');
  });
});
