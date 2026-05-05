import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { previewInvite, sendSigninOtp, sendSignupOtp, verifyOtp } from './actions';
import { createClient } from '@/lib/supabase/server';

const signInWithOtp = vi.fn();
const verifyOtpMock = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

const adminListUsers = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { listUsers: adminListUsers } },
  })),
}));

describe('auth shared actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOtp,
        verifyOtp: verifyOtpMock,
      },
      rpc,
    } as never);
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:4173';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── previewInvite ──────────────────────────────────────────────────────────

  describe('previewInvite', () => {
    it('returns VALIDATION_ERROR for malformed code', async () => {
      const result = await previewInvite({ inviteCode: 'BAD0' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('VALIDATION_ERROR');
    });

    it('returns VALIDATION_ERROR for forbidden chars (1, O)', async () => {
      const result = await previewInvite({ inviteCode: 'ABC10OOX' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('VALIDATION_ERROR');
    });

    it('returns INVITE_USED when RPC says used', async () => {
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'used', error: null }),
      });
      const result = await previewInvite({ inviteCode: 'USED2345' });
      expect(result).toEqual({ success: false, error: 'INVITE_USED' });
    });

    it('returns INVITE_EXPIRED when RPC says expired', async () => {
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'expired', error: null }),
      });
      const result = await previewInvite({ inviteCode: 'EXPR2345' });
      expect(result).toEqual({ success: false, error: 'INVITE_EXPIRED' });
    });

    it('returns success when RPC says valid', async () => {
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'valid', error: null }),
      });
      const result = await previewInvite({ inviteCode: 'VALD2345' });
      expect(result).toEqual({ success: true });
    });

    it('returns INVITE_INVALID on RPC error (fail-closed)', async () => {
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      });
      const result = await previewInvite({ inviteCode: 'BMNK2345' });
      expect(result).toEqual({ success: false, error: 'INVITE_INVALID' });
    });
  });

  // ── sendSigninOtp ──────────────────────────────────────────────────────────

  describe('sendSigninOtp', () => {
    it('returns VALIDATION_ERROR for invalid email', async () => {
      const result = await sendSigninOtp({ email: 'not-an-email' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('VALIDATION_ERROR');
    });

    it('returns EMAIL_NOT_FOUND for unknown email when invites enabled', async () => {
      vi.stubEnv('ENABLE_INVITES', 'true');
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      const result = await sendSigninOtp({ email: 'unknown@example.com' });
      expect(result).toEqual({ success: false, error: 'EMAIL_NOT_FOUND' });
      expect(signInWithOtp).not.toHaveBeenCalled();
    });

    it('sends OTP for unknown email when invites disabled (open-signup parity)', async () => {
      signInWithOtp.mockResolvedValue({ error: null });
      const result = await sendSigninOtp({ email: 'fresh@example.com' });
      expect(result).toEqual({ success: true });
      expect(signInWithOtp).toHaveBeenCalledOnce();
      // listUsers is not consulted when invites are off — saves a round-trip.
      expect(adminListUsers).not.toHaveBeenCalled();
    });

    it('sends OTP for existing email', async () => {
      adminListUsers.mockResolvedValue({
        data: { users: [{ id: 'u1', email: 'existing@example.com' }] },
        error: null,
      });
      signInWithOtp.mockResolvedValue({ error: null });
      const result = await sendSigninOtp({ email: 'existing@example.com' });
      expect(result).toEqual({ success: true });
      expect(signInWithOtp).toHaveBeenCalledOnce();
    });

    it('returns EMAIL_SEND_FAILED when Supabase fails', async () => {
      adminListUsers.mockResolvedValue({
        data: { users: [{ id: 'u1', email: 'existing@example.com' }] },
        error: null,
      });
      signInWithOtp.mockResolvedValue({ error: { message: 'boom' } });
      const result = await sendSigninOtp({ email: 'existing@example.com' });
      expect(result).toEqual({ success: false, error: 'EMAIL_SEND_FAILED' });
    });
  });

  // ── sendSignupOtp ──────────────────────────────────────────────────────────

  describe('sendSignupOtp', () => {
    it('returns EMAIL_ALREADY_EXISTS for known email', async () => {
      adminListUsers.mockResolvedValue({
        data: { users: [{ id: 'u1', email: 'existing@example.com' }] },
        error: null,
      });
      const result = await sendSignupOtp({ email: 'existing@example.com' });
      expect(result).toEqual({ success: false, error: 'EMAIL_ALREADY_EXISTS' });
      expect(signInWithOtp).not.toHaveBeenCalled();
    });

    it('without invites enabled, sends OTP for new email', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      signInWithOtp.mockResolvedValue({ error: null });
      const result = await sendSignupOtp({ email: 'new@example.com' });
      expect(result).toEqual({ success: true });
      expect(signInWithOtp).toHaveBeenCalledOnce();
    });

    describe('invites enabled', () => {
      beforeEach(() => {
        vi.stubEnv('ENABLE_INVITES', 'true');
      });

      it('returns INVITE_REQUIRED when no code provided', async () => {
        adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        const result = await sendSignupOtp({ email: 'new@example.com' });
        expect(result).toEqual({ success: false, error: 'INVITE_REQUIRED' });
      });

      it('returns INVITE_INVALID when preview says invalid', async () => {
        adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        rpc.mockReturnValue({
          single: () => Promise.resolve({ data: 'invalid', error: null }),
        });
        const result = await sendSignupOtp({
          email: 'new@example.com',
          inviteCode: 'NPE22345',
        });
        expect(result).toEqual({ success: false, error: 'INVITE_INVALID' });
      });

      it('returns INVITE_USED when preview says used', async () => {
        adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        rpc.mockReturnValue({
          single: () => Promise.resolve({ data: 'used', error: null }),
        });
        const result = await sendSignupOtp({
          email: 'new@example.com',
          inviteCode: 'USED2345',
        });
        expect(result).toEqual({ success: false, error: 'INVITE_USED' });
      });

      it('returns INVITE_EXPIRED when preview says expired', async () => {
        adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        rpc.mockReturnValue({
          single: () => Promise.resolve({ data: 'expired', error: null }),
        });
        const result = await sendSignupOtp({
          email: 'new@example.com',
          inviteCode: 'EXPR2345',
        });
        expect(result).toEqual({ success: false, error: 'INVITE_EXPIRED' });
      });

      it('passes invite_code in metadata when valid', async () => {
        adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
        rpc.mockReturnValue({
          single: () => Promise.resolve({ data: 'valid', error: null }),
        });
        signInWithOtp.mockResolvedValue({ error: null });
        const result = await sendSignupOtp({
          email: 'new@example.com',
          inviteCode: 'VALD2345',
        });
        expect(result).toEqual({ success: true });
        const calls = signInWithOtp.mock.calls as [
          { email: string; options?: { data?: { invite_code?: string } } },
        ][];
        expect(calls[0][0].options?.data?.invite_code).toBe('VALD2345');
      });
    });
  });

  // ── verifyOtp ──────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('returns INVALID_OR_EXPIRED for bad token', async () => {
      verifyOtpMock.mockResolvedValue({ error: { message: 'expired' } });
      const result = await verifyOtp({ email: 'qa@example.com', token: '123456' });
      expect(result).toEqual({ success: false, error: 'INVALID_OR_EXPIRED' });
    });

    it('redirects to /pocetna on success', async () => {
      verifyOtpMock.mockResolvedValue({ error: null });
      await verifyOtp({ email: 'qa@example.com', token: '123456' });
      expect(vi.mocked(redirect)).toHaveBeenCalledWith('/pocetna');
    });

    it('surfaces INVITE_REJECTED when trigger raised', async () => {
      verifyOtpMock.mockResolvedValue({
        error: { message: 'Database error: INVALID_OR_EXPIRED_INVITE_CODE' },
      });
      const result = await verifyOtp({ email: 'qa@example.com', token: '123456' });
      expect(result).toEqual({ success: false, error: 'INVITE_REJECTED' });
    });
  });
});
