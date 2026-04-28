import { NonRetriableError } from 'inngest';
import { importParseRequested, inngest } from '@/lib/inngest/client';
import { ParsePipelineError, runParsePipeline } from '@/lib/parser/parse-pipeline';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSafe } from '@/lib/logger';

/**
 * AV-2: Async parse worker. Triggered by `import/parse.requested` events
 * sent from the parse route handler when the IMPORTS_ASYNC flag is on.
 *
 * Uses the admin client (no user session in the worker context) and
 * defensively filters every query by `user_id` since RLS is bypassed.
 */
export const parseImportFn = inngest.createFunction(
  {
    id: 'parse-import',
    name: 'Parse import (async)',
    triggers: [{ event: importParseRequested }],
    // Pipeline already retries Gemini calls + circuit-breaks on outage (AV-1).
    // Permanent errors (pdf_not_found, no_text_extracted, insert_failed) gain
    // nothing from a retry. Transient infra failures fall to the watchdog.
    retries: 0,
    concurrency: { key: 'event.data.userId', limit: 2 },
  },
  async ({ event, step }) => {
    const { batchId, userId } = event.data;
    const supabase = createAdminClient();

    const batch = await step.run('load-batch', async () => {
      const { data, error } = await supabase
        .from('import_batches')
        .select('id, account_id, storage_path, status, accounts(institution)')
        .eq('id', batchId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`load_failed: ${error.message}`);
      if (!data) throw new NonRetriableError('batch_not_found');
      // Re-entrant guard: if a previous attempt already ran the pipeline to
      // completion, skip — but allow retries from `enqueued` or `parsing`.
      if (data.status !== 'enqueued' && data.status !== 'parsing') {
        throw new NonRetriableError(`already_processed:${data.status}`);
      }
      return data;
    });

    const storagePath = batch.storage_path;
    if (!storagePath) {
      await supabase
        .from('import_batches')
        .update({ status: 'failed', error_message: 'pdf_not_found' })
        .eq('id', batchId)
        .eq('user_id', userId);
      throw new NonRetriableError('pdf_not_found');
    }

    await step.run('mark-parsing', async () => {
      await supabase
        .from('import_batches')
        .update({ status: 'parsing' })
        .eq('id', batchId)
        .eq('user_id', userId);
    });

    const bankHint = (() => {
      const rel = batch.accounts as
        | { institution?: string | null }
        | { institution?: string | null }[]
        | null;
      if (!rel) return undefined;
      if (Array.isArray(rel)) return rel[0]?.institution ?? undefined;
      return rel.institution ?? undefined;
    })();

    const KNOWN_PIPELINE_CODES = [
      'pdf_not_found',
      'no_text_extracted',
      'service_unavailable',
      'insert_failed',
      'finalize_failed',
    ] as const;

    try {
      const result = await step.run('run-pipeline', async () => {
        try {
          return await runParsePipeline(supabase, {
            batchId,
            userId,
            storagePath,
            bankHint,
          });
        } catch (innerErr) {
          // Inngest serializes errors across the step boundary, losing the
          // ParsePipelineError instance. Surface the code via NonRetriableError
          // (whose `message` survives) so the outer catch can persist it
          // verbatim in `error_message`.
          if (innerErr instanceof ParsePipelineError) {
            throw new NonRetriableError(innerErr.code);
          }
          throw innerErr;
        }
      });
      logSafe('parse_import_async_success', {
        userId,
        batchId,
        count: result.count,
        confidence: result.confidence,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const code =
        KNOWN_PIPELINE_CODES.find((c) => message === c || message.endsWith(`: ${c}`)) ??
        'parse_failed';
      logSafe('parse_import_async_error', { userId, batchId, code, message });
      await supabase
        .from('import_batches')
        .update({ status: 'failed', error_message: code })
        .eq('id', batchId)
        .eq('user_id', userId);
      throw err instanceof NonRetriableError ? err : new NonRetriableError(code);
    }
  },
);
