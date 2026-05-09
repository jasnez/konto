import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { CategorizationSource } from '@/lib/categorization/cascade';
import { revalidateAfterTransactionWrite } from '@/lib/server/revalidate-views';
import { createClient } from '@/lib/supabase/server';
import { logSafe } from '@/lib/logger';

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
export const STORAGE_BUCKET = 'bank-statements';

export const LEARNABLE_SOURCES = new Set<CategorizationSource>([
  'alias_fuzzy',
  'history',
  'llm',
  'none',
]);

export interface ValidationDetails {
  _root: string[];
}

export const BatchIdInputSchema = z.object({ batchId: z.uuid() });

export function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

export function revalidateImportViews(accountId: string | null): void {
  revalidateAfterTransactionWrite(accountId ? [accountId] : []);
  revalidatePath('/import');
}

export function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is outside safe integer range for DB client transport.');
  }
  return Number(value);
}

/** Parsed from `import_dedup_filter` (int[]); ignores out-of-range indices. */
export function parseDedupSkipIndices(raw: unknown, rowCount: number): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(raw)) {
    return out;
  }
  for (const x of raw) {
    let n: number | null = null;
    if (typeof x === 'number' && Number.isInteger(x)) n = x;
    else if (typeof x === 'string' && /^\d+$/.test(x)) n = parseInt(x, 10);
    if (n !== null && n >= 0 && n < rowCount) {
      out.add(n);
    }
  }
  return out;
}

export function isCategorizationSource(value: unknown): value is CategorizationSource {
  return (
    value === 'rule' ||
    value === 'alias_exact' ||
    value === 'alias_fuzzy' ||
    value === 'history' ||
    value === 'llm' ||
    value === 'none'
  );
}

export function extractImportedCount(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'imported' in raw) {
    const value = raw.imported;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Mark batch as failed with FX error. Best-effort: logs but does not throw. */
export async function markBatchFailed(
  supabase: SupabaseClient,
  batchId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('import_batches')
    .update({
      status: 'failed',
      error_message: 'fx_unavailable',
    })
    .eq('id', batchId)
    .eq('user_id', userId);

  if (error) {
    logSafe('mark_batch_failed', { userId, error: error.message });
  }
}
