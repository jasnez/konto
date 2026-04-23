import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { requestAccountDeletion } from '@/app/(app)/podesavanja/obrisi/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { signAccountDeletionCancelToken } from '@/lib/account-deletion/cancel-token';
import { sendAccountDeletionEmail } from '@/lib/account-deletion/send-deletion-email';
import { createClient } from '@/lib/supabase/server';

const getUser = vi.fn();
const signOutMock = vi.fn();
const profileMaybeSingle = vi.fn();
const profileUpdateEq = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/account-deletion/cancel-token', () => ({
  signAccountDeletionCancelToken: vi.fn(() => 'signed-token'),
}));

vi.mock('@/lib/account-deletion/send-deletion-email', () => ({
  sendAccountDeletionEmail: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('requestAccountDeletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    vi.stubEnv('ACCOUNT_DELETION_TOKEN_SECRET', 'test-secret-at-least-32-chars-long!!');
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
    profileMaybeSingle.mockResolvedValue({ data: { deleted_at: null }, error: null });
    profileUpdateEq.mockResolvedValue({ error: null });
    vi.mocked(sendAccountDeletionEmail).mockResolvedValue({ ok: true });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser, signOut: signOutMock },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: profileMaybeSingle,
          }),
        }),
        update: () => ({
          eq: () => profileUpdateEq() as Promise<{ error: null }>,
        }),
      }),
    } as never);
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        insert: (): Promise<{ error: null }> => Promise.resolve({ error: null }),
      }),
    } as never);
  });

  it('returns UNAUTHORIZED when there is no user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await requestAccountDeletion({
      email: 'a@b.com',
      understood: true,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns EMAIL_MISMATCH when confirmation email differs', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'real@example.com' } } });
    const result = await requestAccountDeletion({
      email: 'other@example.com',
      understood: true,
    });
    expect(result).toEqual({ success: false, error: 'EMAIL_MISMATCH' });
  });

  it('returns ALREADY_PENDING when deleted_at is set', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    profileMaybeSingle.mockResolvedValue({
      data: { deleted_at: '2026-01-01T00:00:00.000Z' },
      error: null,
    });
    const result = await requestAccountDeletion({
      email: 'a@b.com',
      understood: true,
    });
    expect(result).toEqual({ success: false, error: 'ALREADY_PENDING' });
  });

  it('rolls back profile when email send fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    vi.mocked(sendAccountDeletionEmail).mockResolvedValue({ ok: false, error: 'SEND_FAILED' });
    const rollbackEq = vi.fn().mockResolvedValue({ error: null });
    let profileEqCalls = 0;
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser, signOut: signOutMock },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: profileMaybeSingle,
          }),
        }),
        update: () => ({
          eq: (): Promise<{ error: null }> => {
            profileEqCalls += 1;
            return (
              profileEqCalls === 1 ? profileUpdateEq() : rollbackEq()
            ) as Promise<{ error: null }>;
          },
        }),
      }),
    } as never);

    const result = await requestAccountDeletion({
      email: 'a@b.com',
      understood: true,
    });
    expect(result).toEqual({ success: false, error: 'EMAIL_SEND_FAILED' });
    expect(rollbackEq).toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('signs out and redirects when deletion request succeeds', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    await expect(
      requestAccountDeletion({
        email: 'a@b.com',
        understood: true,
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(signAccountDeletionCancelToken).toHaveBeenCalledWith('u1', expect.any(Number));
    expect(sendAccountDeletionEmail).toHaveBeenCalledWith(
      'a@b.com',
      expect.stringContaining('/auth/otkazi-brisanje?token='),
    );
    expect(signOutMock).toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/obrisan');
  });
});
