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

  it('round-trips and extracts userId, jti, and exp', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    const verified = verifyAccountDeletionCancelToken(token);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.userId).toBe('user-uuid-1');
    expect(verified.exp).toBe(exp);
    // jti must be a UUID-shaped string
    expect(verified.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  });

  it('each signed token gets a unique jti', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const t1 = signAccountDeletionCancelToken('user-uuid-1', exp);
    const t2 = signAccountDeletionCancelToken('user-uuid-1', exp);
    const v1 = verifyAccountDeletionCancelToken(t1);
    const v2 = verifyAccountDeletionCancelToken(t2);
    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(true);
    if (!v1.ok || !v2.ok) return;
    expect(v1.jti).not.toBe(v2.jti);
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
