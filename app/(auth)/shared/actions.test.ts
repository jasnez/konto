import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { sendOtp, verifyOtp } from './actions';
import { createClient } from '@/lib/supabase/server';

const signInWithOtp = vi.fn();
const verifyOtpMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('auth shared actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOtp,
        verifyOtp: verifyOtpMock,
      },
    } as never);
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:4173';
  });

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
});
