'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

interface ValidationDetails {
  _root: string[];
}

const UploadSchema = z.object({
  accountId: z.uuid(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'Fajl je obavezan')
    .refine((f) => f.size <= MAX_PDF_SIZE_BYTES, 'Fajl je veći od 10 MB')
    .refine((f) => f.type === 'application/pdf', 'Samo PDF je dozvoljen'),
});

export type UploadStatementResult =
  | { success: true; data: { batchId: string } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DUPLICATE'; batchId: string }
  | { success: false; error: 'STORAGE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' };

function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

interface ImportBatchRecord {
  id: string;
}

interface ImportBatchError {
  message: string;
}

interface ImportBatchInsert {
  user_id: string;
  account_id: string;
  storage_path: string;
  checksum: string;
  status: 'uploaded';
  original_filename: string;
}

interface ImportBatchesClient {
  select: (columns: 'id') => {
    eq: (
      column: 'user_id',
      value: string,
    ) => {
      eq: (
        column: 'checksum',
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: ImportBatchRecord | null;
          error: ImportBatchError | null;
        }>;
      };
    };
  };
  insert: (payload: ImportBatchInsert) => {
    select: (columns: 'id') => {
      single: () => Promise<{ data: ImportBatchRecord | null; error: ImportBatchError | null }>;
    };
  };
}

function importBatches(supabase: Awaited<ReturnType<typeof createClient>>): ImportBatchesClient {
  // `import_batches` table lands in a later migration than current generated types.
  return supabase.from('import_batches' as never) as unknown as ImportBatchesClient;
}

export async function uploadStatement(formData: FormData): Promise<UploadStatementResult> {
  const parsed = UploadSchema.safeParse({
    accountId: formData.get('accountId'),
    file: formData.get('file'),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { accountId, file } = parsed.data;

  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('id, user_id, institution')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (accountErr) {
    console.error('upload_statement_account_error', { userId: user.id, error: accountErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!account) return { success: false, error: 'NOT_FOUND' };

  const arrayBuffer = await file.arrayBuffer();
  const checksum = createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex');

  const { data: existing, error: existingErr } = await importBatches(supabase)
    .select('id')
    .eq('user_id', user.id)
    .eq('checksum', checksum)
    .maybeSingle();
  if (existingErr) {
    console.error('upload_statement_duplicate_check_error', {
      userId: user.id,
      error: existingErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (existing?.id) {
    return { success: false, error: 'DUPLICATE', batchId: existing.id };
  }

  const path = `${user.id}/${randomUUID()}.pdf`;
  const { error: uploadErr } = await supabase.storage.from('bank-statements').upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadErr) {
    console.error('upload_statement_storage_error', { userId: user.id, error: uploadErr.message });
    return { success: false, error: 'STORAGE_ERROR' };
  }

  const { data: batch, error: insertErr } = await importBatches(supabase)
    .insert({
      user_id: user.id,
      account_id: accountId,
      storage_path: path,
      checksum,
      status: 'uploaded',
      original_filename: file.name,
    })
    .select('id')
    .single();

  if (insertErr || !batch?.id) {
    console.error('upload_statement_insert_error', {
      userId: user.id,
      error: insertErr?.message ?? 'unknown',
    });
    await supabase.storage
      .from('bank-statements')
      .remove([path])
      .catch(() => {
        // Best-effort cleanup.
      });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/import');
  return { success: true, data: { batchId: batch.id } };
}
