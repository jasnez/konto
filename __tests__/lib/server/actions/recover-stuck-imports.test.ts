/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-empty-function,@typescript-eslint/no-unsafe-argument */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverStuckImports } from '@/lib/server/actions/recover-stuck-imports';
import * as logger from '@/lib/logger';

describe('recoverStuckImports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'logSafe').mockImplementation(() => {});
  });

  it('returns success with 0 recovered when no stuck imports exist', async () => {
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(eqChain),
      }),
    };

    const result = await recoverStuckImports(mockSupabase as any, 'user-123');

    expect(result.success).toBe(true);
    expect(result.recovered).toBe(0);
  });

  it('marks stuck imports as failed with parsing_timeout error', async () => {
    const stuckBatches = [
      { id: 'batch-1', account_id: 'acc-1' },
      { id: 'batch-2', account_id: 'acc-2' },
    ];

    let fromCallCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // First call: select for stuck batches
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockResolvedValue({
              data: stuckBatches,
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue(selectChain),
          };
        }
        // Second call: update to mark as failed
        const updateChain = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ error: null }),
        };
        return {
          update: vi.fn().mockReturnValue(updateChain),
        };
      }),
    };

    const result = await recoverStuckImports(mockSupabase as any, 'user-123');

    expect(result.success).toBe(true);
    expect(result.recovered).toBe(2);
  });

  it('handles query error gracefully', async () => {
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      }),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(eqChain),
      }),
    };

    const result = await recoverStuckImports(mockSupabase as any, 'user-123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to query stuck imports');
  });

  it('handles update error gracefully', async () => {
    const stuckBatches = [{ id: 'batch-1', account_id: 'acc-1' }];

    let callCount = 0;
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: select for stuck batches
          const selectChain = {
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockResolvedValue({
              data: stuckBatches,
              error: null,
            }),
          };
          return {
            select: vi.fn().mockReturnValue(selectChain),
          };
        }
        // Second call: update that fails
        const updateChain = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            error: { message: 'Update failed' },
          }),
        };
        return {
          update: vi.fn().mockReturnValue(updateChain),
        };
      }),
    };

    const result = await recoverStuckImports(mockSupabase as any, 'user-123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to recover stuck imports');
  });

  it('catches unexpected errors', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    const result = await recoverStuckImports(mockSupabase as any, 'user-123');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unexpected error');
  });
});
