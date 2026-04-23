import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { signOut, updateProfile } from './actions';
import { createClient } from '@/lib/supabase/server';

const getUser = vi.fn();
const profileUpdate = vi.fn();
const signOutMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileUpdate.mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser, signOut: signOutMock },
      from: () => ({ update: profileUpdate }),
    } as never);
  });

  it('updateProfile returns UNAUTHORIZED when missing user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await updateProfile({
      display_name: 'QA',
      base_currency: 'BAM',
      locale: 'bs-BA',
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('updateProfile succeeds and revalidates settings path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const result = await updateProfile({
      display_name: 'QA',
      base_currency: 'BAM',
      locale: 'bs-BA',
    });
    expect(result).toEqual({ success: true });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/podesavanja');
  });

  it('signOut redirects to login', async () => {
    await signOut();
    expect(signOutMock).toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/prijava');
  });
});
