import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sweepStuckImports } from '../watchdog-stuck-imports';

interface BatchRow {
  id: string;
  user_id: string;
  status: string;
  updated_at: string;
}

function buildClient(opts: {
  stuck: BatchRow[];
  queryError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  let updatePayload: Record<string, unknown> | null = null;
  let updateIds: string[] | null = null;

  const from = vi.fn(() => ({
    select: () => ({
      in: () => ({
        lt: () => ({
          limit: () =>
            Promise.resolve({
              data: opts.stuck,
              error: opts.queryError ?? null,
            }),
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return {
        in: (_col: string, ids: string[]) => {
          updateIds = ids;
          return Promise.resolve({ data: null, error: opts.updateError ?? null });
        },
      };
    },
  }));

  return {
    client: { from },
    getUpdate: () => ({ payload: updatePayload, ids: updateIds }),
  };
}

describe('sweepStuckImports', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns recovered:0 when no stuck batches', async () => {
    const { client, getUpdate } = buildClient({ stuck: [] });
    const result = await sweepStuckImports(client as never);
    expect(result).toEqual({ recovered: 0 });
    expect(getUpdate().payload).toBeNull();
  });

  it('marks stuck batches failed with parsing_timeout', async () => {
    const { client, getUpdate } = buildClient({
      stuck: [
        { id: 'b1', user_id: 'u1', status: 'parsing', updated_at: '2026-01-01' },
        { id: 'b2', user_id: 'u2', status: 'enqueued', updated_at: '2026-01-01' },
      ],
    });
    const result = await sweepStuckImports(client as never);
    expect(result).toEqual({ recovered: 2 });
    const { payload, ids } = getUpdate();
    expect(payload).toEqual({ status: 'failed', error_message: 'parsing_timeout' });
    expect(ids).toEqual(['b1', 'b2']);
  });

  it('throws on query error', async () => {
    const { client } = buildClient({
      stuck: [],
      queryError: { message: 'boom' },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(sweepStuckImports(client as never)).rejects.toThrow(/watchdog_query_failed/);
  });

  it('throws on update error', async () => {
    const { client } = buildClient({
      stuck: [{ id: 'b1', user_id: 'u1', status: 'parsing', updated_at: '2026-01-01' }],
      updateError: { message: 'no_perms' },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(sweepStuckImports(client as never)).rejects.toThrow(/watchdog_update_failed/);
  });
});
