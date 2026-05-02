import type { SupabaseClient } from '@supabase/supabase-js';
import { runCategorizationCascade } from '@/lib/categorization/cascade';
import {
  llmCategorizeBatch,
  LLM_FALLBACK_MIN_AMOUNT_MINOR,
  type LLMCategorizeItem,
} from '@/lib/categorization/llm-categorize';
import { extractPdfText } from '@/lib/parser/extract-text';
import { ocrFallback } from '@/lib/parser/ocr-fallback';
import { CircuitOpenError, parseStatementWithLLM } from '@/lib/parser/llm-parse';
import { redactPII } from '@/lib/parser/redact-pii';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';

/** Min unmatched rows before we bother engaging the LLM batch fallback.
 *  Below this, the cost of one Gemini call (and the rate-limit slot) is
 *  not worth the ergonomics. Caller can override via opts. */
const DEFAULT_LLM_FALLBACK_MIN_ROWS = 5;

export type ParsePipelineErrorCode =
  | 'pdf_not_found'
  | 'no_text_extracted'
  | 'service_unavailable'
  | 'insert_failed'
  | 'finalize_failed';

export class ParsePipelineError extends Error {
  readonly code: ParsePipelineErrorCode;
  readonly cause?: unknown;
  constructor(code: ParsePipelineErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.name = 'ParsePipelineError';
    this.code = code;
    this.cause = cause;
  }
}

export interface ParsePipelineInput {
  batchId: string;
  userId: string;
  storagePath: string;
  bankHint?: string;
}

export interface ParsePipelineResult {
  count: number;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

/**
 * Runs the full PDF → parsed_transactions pipeline for a single batch.
 *
 * Caller is responsible for: auth, rate limiting, marking the batch as
 * `parsing` before the call, and translating thrown errors into HTTP
 * responses. This function only owns the data path.
 *
 * Pass either a user-scoped client (RLS enforced) or an admin client
 * (RLS bypassed but every query still filters `user_id` defensively).
 */
export async function runParsePipeline(
  supabase: SupabaseClient<Database>,
  input: ParsePipelineInput,
): Promise<ParsePipelineResult> {
  const { batchId, userId, storagePath, bankHint } = input;

  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('bank-statements')
    .download(storagePath);
  if (downloadErr) {
    throw new ParsePipelineError('pdf_not_found', 'pdf_not_found', downloadErr);
  }
  const buffer = await fileData.arrayBuffer();

  const extracted = await extractPdfText(buffer);
  let text = extracted.text;
  let hasText = extracted.hasText;
  if (!hasText && !extracted.ocrUsed) {
    text = await ocrFallback(buffer);
    hasText = text.replace(/\s/g, '').length > 0;
  }
  if (!hasText) {
    throw new ParsePipelineError('no_text_extracted');
  }

  const redacted = redactPII(text);

  let parsed;
  try {
    parsed = await parseStatementWithLLM(redacted, bankHint);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      throw new ParsePipelineError('service_unavailable', 'service_unavailable', err);
    }
    throw err;
  }

  if (parsed.transactions.length > 0) {
    const rows: Database['public']['Tables']['parsed_transactions']['Insert'][] = [];
    for (const t of parsed.transactions) {
      const categorization = await runCategorizationCascade(supabase, {
        description: t.description,
        userId,
        amountMinor: t.amountMinor,
      });
      rows.push({
        batch_id: batchId,
        user_id: userId,
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

    // ─── LLM categorization fallback (CLOSEOUT-F2-T2 / cascade step 5) ─────
    //
    // Anything still uncategorised after rule/alias/history AND worth at
    // least 50 KM is a fallback candidate. Below DEFAULT_LLM_FALLBACK_MIN_ROWS
    // unmatched rows we skip — one Gemini call for two stragglers is
    // overkill (and burns the per-user daily budget faster). Failures /
    // rate-limit hits are fatal to the LLM step alone, never to the parse
    // (the rows simply stay source='none', ready for manual review).
    const llmCandidateIndexes: number[] = rows.reduce<number[]>((acc, r, i) => {
      if (
        r.categorization_source === 'none' &&
        Math.abs(r.amount_minor) >= LLM_FALLBACK_MIN_AMOUNT_MINOR
      ) {
        acc.push(i);
      }
      return acc;
    }, []);

    if (llmCandidateIndexes.length >= DEFAULT_LLM_FALLBACK_MIN_ROWS) {
      const candidates: LLMCategorizeItem[] = llmCandidateIndexes.map((idx) => {
        const r = rows[idx];
        return {
          description: r.raw_description,
          amountMinor: r.amount_minor,
          currency: r.currency,
        };
      });
      try {
        const llmResults = await llmCategorizeBatch(supabase, userId, candidates);
        llmCandidateIndexes.forEach((idx, i) => {
          const res = llmResults[i];
          if (!res.categoryId) return;
          const target = rows[idx];
          target.category_id = res.categoryId;
          target.categorization_source = 'llm';
          target.categorization_confidence = res.confidence;
        });
      } catch (err) {
        // Never fail the parse over LLM categorization issues — rows
        // remain source='none' and the user categorises them in review.
        logSafe('parse_pipeline_llm_categorize_error', {
          userId,
          batchId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { error: insertErr } = await supabase.from('parsed_transactions').insert(rows);
    if (insertErr) {
      logSafe('parse_pipeline_insert_error', {
        userId,
        batchId,
        error: insertErr.message,
      });
      throw new ParsePipelineError('insert_failed', 'insert_failed', insertErr);
    }
  }

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
    .eq('id', batchId)
    .eq('user_id', userId);
  if (updateErr) {
    logSafe('parse_pipeline_finalize_error', {
      userId,
      batchId,
      error: updateErr.message,
    });
    throw new ParsePipelineError('finalize_failed', 'finalize_failed', updateErr);
  }

  return {
    count: parsed.transactions.length,
    confidence: parsed.confidence,
    warnings: parsed.warnings,
  };
}
