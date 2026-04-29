import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCancelDeletion } from '@/lib/account-deletion/run-cancel-deletion';
import { createAdminClient } from '@/lib/supabase/admin';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ mustExist: (_k: string, v: string | undefined) => v ?? '' }));
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
vi.stubEnv('ACCOUNT_DELETION_TOKEN_SECRET', 'test-secret-at-least-32-chars-long!!');

// Build a valid token for testing with sign/verify helpers.
import { signAccountDeletionCancelToken } from '@/lib/account-deletion/cancel-token';

// ─── Admin client builder ─────────────────────────────────────────────────────

interface AdminStub {
  jtiInsertError?: { code?: string; message: string } | null;
  getUserByIdData?: { user: { email: string } } | null;
  getUserByIdError?: { message: string } | null;
  profileData?: { deleted_at: string | null } | null;
  profileError?: { message: string } | null;
  profileUpdateError?: { message: string } | null;
  generateLinkData?: { properties: { action_link: string } } | null;
  generateLinkError?: { message: string } | null;
}

function makeAdmin(stub: AdminStub = {}) {
  return {
    from: (table: string) => {
      if (table === 'deletion_cancel_tokens') {
        return {
          insert: () =>
            Promise.resolve({
              error: stub.jtiInsertError !== undefined ? stub.jtiInsertError : null,
            }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: stub.profileData ?? { deleted_at: '2026-01-01T00:00:00.000Z' },
                  error: stub.profileError ?? null,
                }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: stub.profileUpdateError ?? null }),
          }),
        };
      }
      return {};
    },
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: stub.getUserByIdData ?? { user: { email: 'test@example.com' } },
            error: stub.getUserByIdError ?? null,
          }),
        generateLink: () =>
          Promise.resolve({
            data: stub.generateLinkData ?? {
              properties: { action_link: 'https://example.com/magic' },
            },
            error: stub.generateLinkError ?? null,
          }),
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runCancelDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns INVALID_TOKEN for a garbage string', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as never);
    const result = await runCancelDeletion('not-a-valid-token');
    expect(result).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('returns INVALID_TOKEN for an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10; // already expired
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as never);
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('returns TOKEN_ALREADY_USED when jti is already in the table (replay attack, deletion still pending)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    // Default profileData has deleted_at set → deletion still active → TOKEN_ALREADY_USED.
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ jtiInsertError: { code: '23505', message: 'duplicate key' } }) as never,
    );
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: false, error: 'TOKEN_ALREADY_USED' });
  });

  it('returns magicLinkUrl (idempotent) when jti is already used but deletion is already cleared', async () => {
    // UX-6: duplicate request / browser retry after the cancellation already succeeded.
    // deleted_at IS NULL means the first redemption did its job; return a fresh link.
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({
        jtiInsertError: { code: '23505', message: 'duplicate key' },
        profileData: { deleted_at: null },
      }) as never,
    );
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: true, magicLinkUrl: 'https://example.com/magic' });
  });

  it('returns NOT_SCHEDULED when profile has no pending deletion', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ profileData: { deleted_at: null } }) as never,
    );
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: false, error: 'NOT_SCHEDULED' });
  });

  it('returns magicLinkUrl on a valid first-time redemption', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin() as never);
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: true, magicLinkUrl: 'https://example.com/magic' });
  });

  it('returns USER_NOT_FOUND when getUserById fails', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ getUserByIdError: { message: 'not found' } }) as never,
    );
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: false, error: 'USER_NOT_FOUND' });
  });

  it('returns MAGIC_LINK_FAILED when generateLink errors', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = signAccountDeletionCancelToken('user-uuid-1', exp);
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ generateLinkError: { message: 'rate limit' } }) as never,
    );
    const result = await runCancelDeletion(token);
    expect(result).toEqual({ ok: false, error: 'MAGIC_LINK_FAILED' });
  });
});
