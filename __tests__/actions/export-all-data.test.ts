import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAllData } from '@/app/(app)/podesavanja/actions';
import { buildUserExportJsonForRequest } from '@/lib/export/build-user-export-json';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/export/build-user-export-json', () => ({
  buildUserExportJsonForRequest: vi.fn(),
}));

const getUser = vi.fn();

describe('exportAllData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser },
    } as never);
  });

  it('returns UNAUTHORIZED when missing user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await exportAllData();
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(vi.mocked(buildUserExportJsonForRequest)).not.toHaveBeenCalled();
  });

  it('returns json when build succeeds', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    vi.mocked(buildUserExportJsonForRequest).mockResolvedValue({ ok: true, json: '{}' });

    const result = await exportAllData();

    expect(result).toEqual({ success: true, json: '{}' });
    expect(vi.mocked(buildUserExportJsonForRequest)).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('forwards RATE_LIMITED', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    vi.mocked(buildUserExportJsonForRequest).mockResolvedValue({
      ok: false,
      error: 'RATE_LIMITED',
    });

    const result = await exportAllData();

    expect(result).toEqual({ success: false, error: 'RATE_LIMITED' });
  });
});
