import { NextResponse, type NextRequest } from 'next/server';
import { runCategorizationCascade } from '@/lib/categorization/cascade';
import { extractPdfText } from '@/lib/parser/extract-text';
import { ocrFallback } from '@/lib/parser/ocr-fallback';
import { parseStatementWithLLM } from '@/lib/parser/llm-parse';
import { redactPII } from '@/lib/parser/redact-pii';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

/**
 * POST /api/imports/[batchId]/parse
 *
 * Full PDF → structured transactions pipeline (F2-E2-T5):
 *   download → extractPdfText → (OCR fallback) → redactPII → LLM parse → insert.
 *
 * Runs synchronously inside the Route Handler (no queue in Phase 2).
 * Protected by Supabase auth; RLS blocks cross-user batch access.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ParseRouteParams {
  params: Promise<{ batchId: string }>;
}

type ParseErrorCode =
  | 'unauth'
  | 'not_found'
  | 'already_processed'
  | 'pdf_not_found'
  | 'no_text_extracted'
  | 'parse_failed';

function jsonError(code: ParseErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(_req: NextRequest, { params }: ParseRouteParams) {
  const { batchId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('unauth', 401);

  // RLS blocks batches belonging to other users; we still explicitly match user_id
  // in the update queries below (defense-in-depth, per security rules).
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .select('id, account_id, storage_path, status, accounts(institution)')
    .eq('id', batchId)
    .maybeSingle();

  if (batchErr) {
    console.error('parse_route_load_error', { userId: user.id, error: batchErr.message });
    return jsonError('parse_failed', 500);
  }
  if (!batch) return jsonError('not_found', 404);
  if (batch.status !== 'uploaded') {
    return jsonError('already_processed', 409);
  }
  if (!batch.storage_path) {
    await supabase
      .from('import_batches')
      .update({ status: 'failed', error_message: 'pdf_not_found' })
      .eq('id', batch.id)
      .eq('user_id', user.id);
    return jsonError('pdf_not_found', 404);
  }

  // Mark as parsing so the UI (and re-entrant requests) know work is in flight.
  await supabase
    .from('import_batches')
    .update({ status: 'parsing' })
    .eq('id', batch.id)
    .eq('user_id', user.id);

  try {
    // 1. Download PDF from Storage.
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('bank-statements')
      .download(batch.storage_path);
    if (downloadErr) {
      throw new Error('pdf_not_found');
    }
    const buffer = await fileData.arrayBuffer();

    // 2. Extract text. `extractPdfText` already transparently invokes the Mistral
    //    OCR fallback when available, so most image-only PDFs come back with
    //    `hasText: true`. The explicit `ocrFallback` call below covers the edge
    //    case where the internal attempt was skipped (no key) or silently failed
    //    and we want a surfaced error instead of an empty payload reaching the
    //    LLM.
    const extracted = await extractPdfText(buffer);
    let text = extracted.text;
    let hasText = extracted.hasText;
    if (!hasText && !extracted.ocrUsed) {
      text = await ocrFallback(buffer);
      hasText = text.replace(/\s/g, '').length > 0;
    }
    if (!hasText) {
      throw new Error('no_text_extracted');
    }

    // 3. Redact PII before sending anything to the LLM.
    const redacted = redactPII(text);

    // 4. LLM parse (gemini-2.5-flash-lite, temperature 0, schema-guided JSON).
    // `accounts` may be returned as an object or (when PostgREST infers many-to-one
    // via the generated types) a single-element array; normalise defensively.
    const bankHint = (() => {
      const rel = batch.accounts as
        | { institution?: string | null }
        | { institution?: string | null }[]
        | null;
      if (!rel) return undefined;
      if (Array.isArray(rel)) return rel[0]?.institution ?? undefined;
      return rel.institution ?? undefined;
    })();
    const parsed = await parseStatementWithLLM(redacted, bankHint);

    // 5. Insert parsed rows into the staging table for user review.
    if (parsed.transactions.length > 0) {
      const rows: Database['public']['Tables']['parsed_transactions']['Insert'][] = [];
      for (const t of parsed.transactions) {
        const categorization = await runCategorizationCascade(supabase, {
          description: t.description,
          userId: user.id,
          amountMinor: t.amountMinor,
        });
        rows.push({
          batch_id: batch.id,
          user_id: user.id,
          transaction_date: t.date,
          amount_minor: t.amountMinor,
          currency: t.currency,
          raw_description: t.description,
          reference: t.reference ?? null,
          status: 'pending_review' as const,
          parse_confidence: parsed.confidence,
          merchant_id: categorization.merchantId ?? null,
          category_id: categorization.categoryId ?? null,
          categorization_source: categorization.source,
          categorization_confidence: categorization.confidence,
          selected_for_import: true,
        });
      }
      const { error: insertErr } = await supabase.from('parsed_transactions').insert(rows);
      if (insertErr) {
        console.error('parse_route_insert_error', {
          userId: user.id,
          batchId: batch.id,
          error: insertErr.message,
        });
        throw new Error('insert_failed');
      }
    }

    // 6. Finalise batch state.
    const { error: updateErr } = await supabase
      .from('import_batches')
      .update({
        status: 'ready',
        transaction_count: parsed.transactions.length,
        parse_confidence: parsed.confidence,
        parse_warnings: parsed.warnings,
        statement_period_start: parsed.statementPeriodStart ?? null,
        statement_period_end: parsed.statementPeriodEnd ?? null,
        error_message: null,
      })
      .eq('id', batch.id)
      .eq('user_id', user.id);
    if (updateErr) {
      console.error('parse_route_finalize_error', {
        userId: user.id,
        batchId: batch.id,
        error: updateErr.message,
      });
      throw new Error('finalize_failed');
    }

    return NextResponse.json({
      success: true,
      count: parsed.transactions.length,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('parse_route_error', { userId: user.id, batchId: batch.id, error: message });

    await supabase
      .from('import_batches')
      .update({ status: 'failed', error_message: message })
      .eq('id', batch.id)
      .eq('user_id', user.id);

    return jsonError('parse_failed', 500);
  }
}
