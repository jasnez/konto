import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { sendOtp, verifyOtp } from './actions';
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

// Admin client mocked separately because the new sendOtp imports it
// dynamically when ENABLE_INVITES=true to check email existence.
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

  // ── Existing flow (invites disabled) ────────────────────────────────────────

  it('sendOtp returns VALIDATION_ERROR for invalid email', async () => {
    const result = await sendOtp({ email: 'bad-email' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('VALIDATION_ERROR');
  });

  it('sendOtp returns EMAIL_SEND_FAILED when provider fails', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'boom' } });
    const result = await sendOtp({ email: 'qa@example.com' });
    expect(result).toEqual({ success: false, error: 'EMAIL_SEND_FAILED' });
  });

  it('sendOtp without invites enabled does not call admin / rpc', async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const result = await sendOtp({ email: 'qa@example.com' });
    expect(result).toEqual({ success: true, isNewUser: false });
    expect(adminListUsers).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verifyOtp returns INVALID_OR_EXPIRED for bad token', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'expired' } });
    const result = await verifyOtp({ email: 'qa@example.com', token: '123456' });
    expect(result).toEqual({ success: false, error: 'INVALID_OR_EXPIRED' });
  });

  it('verifyOtp redirects to /pocetna on success', async () => {
    verifyOtpMock.mockResolvedValue({ error: null });
    await verifyOtp({ email: 'qa@example.com', token: '123456' });
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/pocetna');
  });

  it('verifyOtp surfaces INVITE_REJECTED when trigger raised', async () => {
    verifyOtpMock.mockResolvedValue({
      error: { message: 'Database error: INVALID_OR_EXPIRED_INVITE_CODE' },
    });
    const result = await verifyOtp({ email: 'qa@example.com', token: '123456' });
    expect(result).toEqual({ success: false, error: 'INVITE_REJECTED' });
  });

  // ── New flow (ENABLE_INVITES=true) ──────────────────────────────────────────

  describe('invites enabled', () => {
    beforeEach(() => {
      vi.stubEnv('ENABLE_INVITES', 'true');
    });

    it('sendOtp blocks new user with no invite code', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      const result = await sendOtp({ email: 'newbie@example.com' });
      expect(result).toEqual({ success: false, error: 'INVITE_REQUIRED' });
      expect(signInWithOtp).not.toHaveBeenCalled();
    });

    it('sendOtp returns INVITE_INVALID when preview RPC says invalid', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'invalid', error: null }),
      });
      const result = await sendOtp({
        email: 'newbie@example.com',
        inviteCode: 'NPE22345', // valid alphabet (A-HJ-NP-Z2-9), exists in mock as "invalid"
      });
      expect(result).toEqual({ success: false, error: 'INVITE_INVALID' });
      expect(signInWithOtp).not.toHaveBeenCalled();
    });

    it('sendOtp returns INVITE_USED when preview RPC says used', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'used', error: null }),
      });
      const result = await sendOtp({
        email: 'newbie@example.com',
        inviteCode: 'USED2345',
      });
      expect(result).toEqual({ success: false, error: 'INVITE_USED' });
    });

    it('sendOtp returns INVITE_EXPIRED when preview RPC says expired', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'expired', error: null }),
      });
      const result = await sendOtp({
        email: 'newbie@example.com',
        inviteCode: 'EXPR2345',
      });
      expect(result).toEqual({ success: false, error: 'INVITE_EXPIRED' });
    });

    it('sendOtp passes invite_code in metadata when valid', async () => {
      adminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
      rpc.mockReturnValue({
        single: () => Promise.resolve({ data: 'valid', error: null }),
      });
      signInWithOtp.mockResolvedValue({ error: null });
      const result = await sendOtp({
        email: 'newbie@example.com',
        inviteCode: 'VALD2345',
      });
      expect(result).toEqual({ success: true, isNewUser: true });
      expect(signInWithOtp).toHaveBeenCalledOnce();
      const calls = signInWithOtp.mock.calls as [
        { email: string; options?: { data?: { invite_code?: string } } },
      ][];
      const arg = calls[0][0];
      expect(arg.email).toBe('newbie@example.com');
      expect(arg.options?.data?.invite_code).toBe('VALD2345');
    });

    it('sendOtp waives gate for existing user (sign-in flow)', async () => {
      adminListUsers.mockResolvedValue({
        data: { users: [{ id: 'u1', email: 'existing@example.com' }] },
        error: null,
      });
      signInWithOtp.mockResolvedValue({ error: null });
      const result = await sendOtp({ email: 'existing@example.com' });
      expect(result).toEqual({ success: true, isNewUser: false });
      expect(signInWithOtp).toHaveBeenCalled();
    });
  });
});
