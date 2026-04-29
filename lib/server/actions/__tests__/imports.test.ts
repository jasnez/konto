import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { uploadStatement } from '@/lib/server/actions/imports';
import { createClient } from '@/lib/supabase/server';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

type QueryResult<T> = Promise<{ data: T; error: { message: string } | null }>;

interface AccountsQuery {
  select: (fields: string) => {
    eq: (
      column: string,
      value: string,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        is: (
          column: string,
          value: null,
        ) => {
          maybeSingle: () => QueryResult<{
            id: string;
            user_id: string;
            institution: string | null;
          } | null>;
        };
      };
    };
  };
}

interface ImportBatchQuery {
  select: (fields: string) => {
    eq: (
      column: string,
      value: string,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => QueryResult<{ id: string } | null>;
      };
    };
  };
  insert: (payload: Record<string, unknown>) => {
    select: (fields: string) => {
      single: () => QueryResult<{ id: string } | null>;
    };
  };
}

const getUser = vi.fn();
const from = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

// SE-5: prefix with PDF magic bytes so the server-side magic-byte check passes.
const PDF_MAGIC = '%PDF-1.4\n';

function makePdfFile(content = 'fake body', name = 'statement.pdf') {
  return new File([PDF_MAGIC + content], name, { type: 'application/pdf' });
}

/** File that claims to be PDF but has wrong magic bytes (e.g. renamed JPEG). */
function makeSpoofedFile(name = 'evil.pdf') {
  return new File(['\xFF\xD8\xFF fake jpeg content'], name, { type: 'application/pdf' });
}

describe('uploadStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    from.mockReset();
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    rpc.mockReset();
    rpc.mockResolvedValue({ data: true, error: null });

    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser },
      from,
      rpc,
      storage: {
        from: vi.fn(() => ({
          upload,
          remove,
        })),
      },
    } as never);
  });

  it('prihvata validan PDF i kreira import_batch', async () => {
    let insertedPayload: Record<string, unknown> | undefined;
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        const q: AccountsQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: 'acc-1', user_id: 'user-1', institution: 'Raiffeisen' },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
        return q;
      }
      if (table === 'import_batches') {
        const q: ImportBatchQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'batch-1' }, error: null }),
              }),
            };
          },
        };
        return q;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makePdfFile('valid-pdf-content'));

    const result = await uploadStatement(formData);

    expect(result).toEqual({ success: true, data: { batchId: 'batch-1' } });
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/[0-9a-f-]{36}\.pdf$/),
      expect.any(File),
      expect.objectContaining({ contentType: 'application/pdf', upsert: false }),
    );
    expect(insertedPayload).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        account_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'uploaded',
        original_filename: 'statement.pdf',
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/import');
  });

  it('odbija fajl veci od 10 MB', async () => {
    const bigContent = 'a'.repeat(10 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makePdfFile(bigContent));

    const result = await uploadStatement(formData);

    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.error).toBe('VALIDATION_ERROR');
      expect(result.details._root[0]).toContain('10 MB');
    }
  });

  it('odbija non-PDF MIME type', async () => {
    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', new File(['x'], 'statement.txt', { type: 'text/plain' }));

    const result = await uploadStatement(formData);

    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.error).toBe('VALIDATION_ERROR');
      expect(result.details._root[0]).toContain('PDF');
    }
  });

  it('odbija fajl sa PDF MIME ali krivim magic bajtovima — SE-5', async () => {
    // Simulates a renamed JPEG/EXE that claims application/pdf.
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        const q: AccountsQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: 'acc-1', user_id: 'user-1', institution: null },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
        return q;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makeSpoofedFile());

    const result = await uploadStatement(formData);

    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details._root[0]).toContain('PDF');
    }
    // Magic-byte check fires before rate-limit and storage — neither touched.
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('odbija ako account ne pripada useru', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table ${table}`);
      const q: AccountsQuery = {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
      return q;
    });

    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makePdfFile('content'));

    const result = await uploadStatement(formData);
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('detektuje duplikat preko checksum-a', async () => {
    let importSelectCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        const q: AccountsQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: 'acc-1', user_id: 'user-1', institution: null },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
        return q;
      }
      if (table === 'import_batches') {
        importSelectCalls += 1;
        const q: ImportBatchQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: importSelectCalls === 1 ? { id: 'batch-existing' } : null,
                    error: null,
                  }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'should-not-happen' }, error: null }),
            }),
          }),
        };
        return q;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makePdfFile('same-pdf-content'));

    const result = await uploadStatement(formData);

    expect(result).toEqual({ success: false, error: 'DUPLICATE', batchId: 'batch-existing' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('cleanup-uje Storage ako DB insert faila', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        const q: AccountsQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: 'acc-1', user_id: 'user-1', institution: null },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
        return q;
      }
      if (table === 'import_batches') {
        const q: ImportBatchQuery = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }),
            }),
          }),
        };
        return q;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const formData = new FormData();
    formData.set('accountId', '123e4567-e89b-12d3-a456-426614174000');
    formData.set('file', makePdfFile('cleanup-content'));

    const result = await uploadStatement(formData);

    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^user-1\/[0-9a-f-]{36}\.pdf$/)]);
  });
});
