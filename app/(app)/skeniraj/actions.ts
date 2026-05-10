'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeDedupHash } from '@/lib/dedup';
import { computeAccountLedgerCents } from '@/lib/fx/account-ledger';
import { convertToBase } from '@/lib/fx/convert';
import { extractReceiptFields } from '@/lib/llm/gemini-receipt';
import { resolveMerchantForReceipt } from '@/lib/merchants/resolve-merchant';
import {
  ExtractedReceiptSchema,
  emptyExtractedReceipt,
  type ExtractedReceipt,
} from '@/lib/schemas/receipt';
import { ensureOwnedAccount, ensureOwnedCategory } from '@/lib/server/db/ensure-owned';
import { revalidateAfterTransactionWrite } from '@/lib/server/revalidate-views';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

const DAILY_SCAN_LIMIT = 20;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationDetails {
  _root: string[];
}

export type UploadReceiptResult =
  | { success: true; data: { scanId: string } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'RATE_LIMIT_EXCEEDED' }
  | { success: false; error: 'FILE_TOO_LARGE' }
  | { success: false; error: 'UNSUPPORTED_MIME' }
  | { success: false; error: 'STORAGE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' };

export type AnalyzeReceiptResult =
  | { success: true; data: { scanId: string; extracted: ExtractedReceipt } }
  | { success: false; error: 'UNAUTHORIZED' }
  // SE-14: ownership-fail returns NOT_FOUND (no longer FORBIDDEN).
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'STORAGE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'LLM_ERROR'; message: string };

export type CreateTransactionFromReceiptResult =
  | {
      success: true;
      data: { transactionId: string; merchantId: string | null; merchantCreated: boolean };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  // SE-14: ownership-fail returns NOT_FOUND (no longer FORBIDDEN).
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export type GetSignedReceiptUrlResult =
  | { success: true; data: { url: string; expiresAt: string } }
  | { success: false; error: 'UNAUTHORIZED' }
  // SE-14: ownership-fail returns NOT_FOUND (no longer FORBIDDEN).
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'STORAGE_ERROR' };

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────────────────────────────────

const AnalyzeInputSchema = z.uuid();

const ConfirmInputSchema = z.object({
  scan_id: z.uuid(),
  account_id: z.uuid(),
  amount_cents: z.bigint().refine((v) => v > 0n, 'Iznos mora biti pozitivan.'),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  merchant_raw: z.string().max(200).nullable(),
  category_id: z.union([z.uuid(), z.null()]).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount outside safe integer range.');
  }
  return Number(value);
}

function buildMonthFolder(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) uploadReceipt — accepts a FormData with { file: File }
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadReceipt(formData: FormData): Promise<UploadReceiptResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: ['Fajl je obavezan.'] },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'FILE_TOO_LARGE' };
  }

  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { success: false, error: 'UNSUPPORTED_MIME' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  // Rate limit: 20 per UTC day.
  const { data: countData, error: countErr } = await supabase.rpc('count_receipt_scans_today');
  if (countErr) {
    logSafe('receipt_rate_limit_error', { userId: user.id, error: countErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (typeof countData === 'number' && countData >= DAILY_SCAN_LIMIT) {
    return { success: false, error: 'RATE_LIMIT_EXCEEDED' };
  }

  const ext = MIME_TO_EXT[mime] ?? 'bin';
  const storagePath = `${user.id}/${buildMonthFolder(new Date())}/${randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from('receipts').upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    logSafe('receipt_storage_upload_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'STORAGE_ERROR' };
  }

  const { data: scan, error: insErr } = await supabase
    .from('receipt_scans')
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      mime,
      size_bytes: file.size,
      status: 'uploaded',
    })
    .select('id')
    .single();
  if (insErr) {
    logSafe('receipt_scans_insert_error', {
      userId: user.id,
      error: insErr.message,
    });
    await supabase.storage
      .from('receipts')
      .remove([storagePath])
      .catch(() => {
        /* best-effort */
      });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  return { success: true, data: { scanId: scan.id } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) analyzeReceipt — OCR + LLM extraction, updates the row
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeReceipt(input: unknown): Promise<AnalyzeReceiptResult> {
  const parsed = AnalyzeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'NOT_FOUND' };
  }
  const scanId = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { data: scan, error: scanErr } = await supabase
    .from('receipt_scans')
    .select('id, user_id, storage_path, mime, status, extracted_json')
    .eq('id', scanId)
    .maybeSingle();
  if (scanErr) {
    logSafe('receipt_scan_fetch_error', { userId: user.id, error: scanErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!scan) return { success: false, error: 'NOT_FOUND' };
  if (scan.user_id !== user.id) return { success: false, error: 'NOT_FOUND' };

  // Idempotent short-circuit: already extracted → just return cached payload.
  if (scan.status === 'extracted' && scan.extracted_json) {
    const cached = ExtractedReceiptSchema.safeParse(scan.extracted_json);
    if (cached.success) {
      return { success: true, data: { scanId: scan.id, extracted: cached.data } };
    }
  }

  await supabase
    .from('receipt_scans')
    .update({ status: 'processing', error_message: null })
    .eq('id', scan.id)
    .eq('user_id', user.id);

  const { data: blob, error: dlErr } = await supabase.storage
    .from('receipts')
    .download(scan.storage_path);
  if (dlErr) {
    await supabase
      .from('receipt_scans')
      .update({
        status: 'error',
        error_message: dlErr.message,
      })
      .eq('id', scan.id)
      .eq('user_id', user.id);
    return { success: false, error: 'STORAGE_ERROR' };
  }

  const arrayBuffer = await blob.arrayBuffer();
  const result = await extractReceiptFields(new Uint8Array(arrayBuffer), scan.mime);

  const extractedJson = JSON.parse(JSON.stringify(result.extracted)) as Json;
  if (!result.ok) {
    await supabase
      .from('receipt_scans')
      .update({
        status: 'error',
        error_message: result.error ?? 'unknown',
        extracted_json: extractedJson,
        extracted_at: new Date().toISOString(),
      })
      .eq('id', scan.id)
      .eq('user_id', user.id);
    return {
      success: false,
      error: 'LLM_ERROR',
      message: result.error ?? 'Ekstrakcija nije uspjela.',
    };
  }

  const { error: upErr } = await supabase
    .from('receipt_scans')
    .update({
      status: 'extracted',
      extracted_json: extractedJson,
      extracted_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', scan.id)
    .eq('user_id', user.id);
  if (upErr) {
    logSafe('receipt_scan_update_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  return { success: true, data: { scanId: scan.id, extracted: result.extracted } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) createTransactionFromReceipt — confirm + link
// ─────────────────────────────────────────────────────────────────────────────

export async function createTransactionFromReceipt(
  input: unknown,
): Promise<CreateTransactionFromReceiptResult> {
  const parsed = ConfirmInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  // Ownership: scan + account + (optional) category.
  const { data: scan, error: scanErr } = await supabase
    .from('receipt_scans')
    .select('id, user_id, status, transaction_id')
    .eq('id', data.scan_id)
    .maybeSingle();
  if (scanErr) return { success: false, error: 'DATABASE_ERROR' };
  if (!scan) return { success: false, error: 'NOT_FOUND' };
  if (scan.user_id !== user.id) return { success: false, error: 'NOT_FOUND' };
  if (scan.transaction_id) {
    // Already linked — return that transaction for idempotency. We don't refetch
    // the merchant link here; the second call gets a benign null + false.
    return {
      success: true,
      data: { transactionId: scan.transaction_id, merchantId: null, merchantCreated: false },
    };
  }

  // MT-12: replace hand-rolled ownership selects with shared helpers.
  // Helpers enforce `eq('user_id', user.id)` at the query level (cleaner
  // than post-fetch `account?.user_id !== user.id` checks) plus
  // `is('deleted_at', null)` for accounts. Helpers return NOT_FOUND on
  // ownership-fail per SE-14 standardization. `ensureOwnedAccount`
  // surfaces `currency` for the FX pipeline below.
  const ownedAccount = await ensureOwnedAccount(supabase, user.id, data.account_id);
  if (!ownedAccount.ok) {
    return { success: false, error: ownedAccount.error };
  }
  const accountCurrency = ownedAccount.currency;

  if (data.category_id) {
    const ownedCategory = await ensureOwnedCategory(supabase, user.id, data.category_id);
    if (!ownedCategory.ok) {
      return { success: false, error: ownedCategory.error };
    }
  }

  // Base currency for FX.
  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  const baseCurrency = profile?.base_currency ?? 'BAM';

  // Receipt = expense → negative.
  const signedCents = -data.amount_cents;

  let fxResult: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxResult = await convertToBase(signedCents, data.currency, baseCurrency, data.transaction_date);
  } catch (err) {
    logSafe('receipt_fx_error', {
      userId: user.id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  let ledgerCents: bigint;
  try {
    ledgerCents = await computeAccountLedgerCents(
      accountCurrency,
      signedCents,
      data.currency,
      fxResult.baseCents,
      baseCurrency,
      data.transaction_date,
    );
  } catch (err) {
    logSafe('receipt_ledger_fx_error', {
      userId: user.id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  // Auto-link or auto-create the merchant from the OCR'd / user-edited name.
  // Never fails the save — returns { merchantId: null, created: false } on any
  // error. dedup_hash continues to use the raw user input (not canonical) so
  // we don't change historical hashing semantics.
  const { merchantId, created: merchantCreated } = await resolveMerchantForReceipt(
    supabase,
    user.id,
    data.merchant_raw,
  );

  const dedupHash = computeDedupHash({
    account_id: data.account_id,
    amount_cents: signedCents,
    date: data.transaction_date,
    merchant: data.merchant_raw,
  });

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: data.account_id,
      original_amount_cents: bigintToDbInt(signedCents),
      original_currency: data.currency,
      base_amount_cents: bigintToDbInt(fxResult.baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: bigintToDbInt(ledgerCents),
      fx_rate: fxResult.fxRate,
      fx_rate_date: fxResult.fxRateDate,
      fx_stale: fxResult.fxStale,
      transaction_date: data.transaction_date,
      merchant_raw: data.merchant_raw,
      merchant_id: merchantId,
      category_id: data.category_id ?? null,
      category_source: data.category_id ? 'user' : null,
      notes: data.notes ?? null,
      source: 'import_receipt',
      dedup_hash: dedupHash,
      receipt_scan_id: data.scan_id,
    })
    .select('id')
    .single();

  if (txErr) {
    logSafe('receipt_tx_insert_error', { userId: user.id, error: txErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Link scan → transaction for fast detail-page lookup.
  await supabase
    .from('receipt_scans')
    .update({ transaction_id: tx.id })
    .eq('id', data.scan_id)
    .eq('user_id', user.id);

  revalidateAfterTransactionWrite([data.account_id]);
  revalidatePath('/skeniraj');
  if (merchantCreated) revalidatePath('/merchants');

  return {
    success: true,
    data: { transactionId: tx.id, merchantId, merchantCreated },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) getSignedReceiptUrl — for transaction detail page preview
// ─────────────────────────────────────────────────────────────────────────────

export async function getSignedReceiptUrl(
  scanId: unknown,
  expiresInSec = 300,
): Promise<GetSignedReceiptUrlResult> {
  const parsed = AnalyzeInputSchema.safeParse(scanId);
  if (!parsed.success) return { success: false, error: 'NOT_FOUND' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { data: scan, error } = await supabase
    .from('receipt_scans')
    .select('id, user_id, storage_path')
    .eq('id', parsed.data)
    .maybeSingle();
  if (error) return { success: false, error: 'STORAGE_ERROR' };
  if (!scan) return { success: false, error: 'NOT_FOUND' };
  if (scan.user_id !== user.id) return { success: false, error: 'NOT_FOUND' };

  const { data: signed, error: signErr } = await supabase.storage
    .from('receipts')
    .createSignedUrl(scan.storage_path, expiresInSec);
  if (signErr || !signed.signedUrl) {
    return { success: false, error: 'STORAGE_ERROR' };
  }

  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  return { success: true, data: { url: signed.signedUrl, expiresAt } };
}

// Export for use by extracted-receipt consumers.
export { emptyExtractedReceipt };
