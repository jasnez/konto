import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { restoreDefaultCategories, signOut, updateProfile } from './actions';
import { createClient } from '@/lib/supabase/server';

const getUser = vi.fn();
const profileUpdate = vi.fn();
const signOutMock = vi.fn();
const rpc = vi.fn();

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
    rpc.mockResolvedValue({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser, signOut: signOutMock },
      from: () => ({ update: profileUpdate }),
      rpc,
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

  it('updateProfile succeeds and revalidates settings + dashboard paths', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const result = await updateProfile({
      display_name: 'QA',
      base_currency: 'BAM',
      locale: 'bs-BA',
    });
    expect(result).toEqual({ success: true });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/podesavanja');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/pocetna');
  });

  it('signOut redirects to login', async () => {
    await signOut();
    expect(signOutMock).toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/prijava');
  });

  it('restoreDefaultCategories returns UNAUTHORIZED when missing user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await restoreDefaultCategories();
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('restoreDefaultCategories succeeds and revalidates category-related paths', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const result = await restoreDefaultCategories();
    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('restore_default_categories_for_user');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/podesavanja');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/kategorije');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/transakcije');
  });

  it('restoreDefaultCategories returns DATABASE_ERROR on rpc failure', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });
    const result = await restoreDefaultCategories();
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});
