import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { revalidateAfterTransactionWrite } from '@/lib/server/revalidate-views';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('revalidateAfterTransactionWrite', () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  /**
   * SNAPSHOT: changing the path list MUST update this test, which forces
   * explicit acknowledgement during code review. The original sin we are
   * locking out here was `revalidatePath('/')` in `skeniraj/actions.ts`,
   * a no-op that let stale dashboard/list snapshots serve after a
   * transaction write (audit 2026-05-08).
   */
  it('hits dashboard, transactions list, accounts list, and per-account detail (single account)', () => {
    revalidateAfterTransactionWrite(['acc-1']);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['/transakcije', '/pocetna', '/racuni', '/racuni/acc-1']);
  });

  it('hits each per-account detail for a transfer (two accounts)', () => {
    revalidateAfterTransactionWrite(['acc-from', 'acc-to']);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      '/transakcije',
      '/pocetna',
      '/racuni',
      '/racuni/acc-from',
      '/racuni/acc-to',
    ]);
  });

  it('deduplicates account ids (e.g. bulk update touching the same account twice)', () => {
    revalidateAfterTransactionWrite(['acc-1', 'acc-1', 'acc-2', 'acc-1']);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls.filter((p) => p === '/racuni/acc-1')).toHaveLength(1);
    expect(calls.filter((p) => p === '/racuni/acc-2')).toHaveLength(1);
  });

  it('still hits the global views even with an empty accountIds list', () => {
    // Edge case: bulk-delete by IDs may not have any account context to
    // hand — we still need /pocetna et al. to refresh.
    revalidateAfterTransactionWrite([]);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['/transakcije', '/pocetna', '/racuni']);
    // Sanity: no per-account paths in this case.
    expect(calls.some((p) => p.startsWith('/racuni/'))).toBe(false);
  });

  it('never emits the legacy `/` no-op (regression guard)', () => {
    revalidateAfterTransactionWrite(['acc-1']);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    // Belt-and-braces: `/racuni` and `/transakcije` are siblings of `/`,
    // and a future "simplification" might be tempted to fold them under
    // a root revalidation. That breaks the dashboard, which lives under
    // `/pocetna`. Lock it out here.
    expect(calls).not.toContain('/');
  });
});
