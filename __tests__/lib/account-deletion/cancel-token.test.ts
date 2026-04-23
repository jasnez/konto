import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signAccountDeletionCancelToken,
  verifyAccountDeletionCancelToken,
} from '@/lib/account-deletion/cancel-token';

describe('account deletion cancel token', () => {
  beforeEach(() => {
    vi.stubEnv('ACCOUNT_DELETION_TOKEN_SECRET', 'test-secret-at-least-32-chars-long!!');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips and extracts user id', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    const verified = verifyAccountDeletionCancelToken(token);
    expect(verified).toEqual({ ok: true, userId: 'user-uuid-1' });
  });

  it('rejects tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    const parts = token.split('.');
    const payload = parts[0] ?? '';
    const sig = parts[1] ?? '';
    expect(payload.length).toBeGreaterThan(0);
    expect(sig.length).toBeGreaterThan(4);
    const tampered = `${payload}.${sig.slice(0, -3)}zzz`;
    const verified = verifyAccountDeletionCancelToken(tampered);
    expect(verified.ok).toBe(false);
    expect(verified).toMatchObject({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    const verified = verifyAccountDeletionCancelToken(token);
    expect(verified).toMatchObject({ ok: false, error: 'EXPIRED' });
  });
});
