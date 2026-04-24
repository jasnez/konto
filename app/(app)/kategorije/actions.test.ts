import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCategory, reorderCategories, restoreCategory } from './actions';
import { createClient } from '@/lib/supabase/server';

const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('categories actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReset();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser },
      from,
    } as never);
  });

  it('createCategory returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createCategory({
      name: 'Hrana',
      slug: 'hrana',
      icon: null,
      color: null,
      kind: 'expense',
      parent_id: null,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('createCategory succeeds for valid expense category', async () => {
    let call = 0;
    from.mockImplementation((table: string) => {
      if (table !== 'categories') throw new Error('unexpected table');
      call += 1;
      if (call === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: { sort_order: 10 }, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'cat-new' }, error: null }),
          }),
        }),
      };
    });

    const result = await createCategory({
      name: 'Hrana',
      slug: 'hrana',
      icon: null,
      color: null,
      kind: 'expense',
      parent_id: null,
    });
    expect(result).toEqual({ success: true, data: { id: 'cat-new' } });
  });

  it('restoreCategory returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await restoreCategory('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('restoreCategory returns NOT_FOUND when category does not belong to user', async () => {
    from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }));
    const result = await restoreCategory('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('restoreCategory is idempotent when category is already active', async () => {
    from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: '123e4567-e89b-12d3-a456-426614174000', deleted_at: null },
                error: null,
              }),
          }),
        }),
      }),
    }));
    const result = await restoreCategory('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: true });
  });

  it('restoreCategory clears deleted_at on a soft-deleted category', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    });
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: '123e4567-e89b-12d3-a456-426614174000',
                      deleted_at: '2026-04-24T00:00:00Z',
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return { update: updateMock };
    });
    const result = await restoreCategory('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null });
  });

  it('reorderCategories validates mixed ownership and returns NOT_FOUND', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'categories') throw new Error('unexpected table');
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ id: '123e4567-e89b-12d3-a456-426614174000', kind: 'expense' }],
                  error: null,
                }),
            }),
          }),
        }),
      };
    });

    const result = await reorderCategories([
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ]);
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });
});
