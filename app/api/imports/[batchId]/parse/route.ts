import { NextResponse, type NextRequest } from 'next/server';
import { ParsePipelineError, runParsePipeline } from '@/lib/parser/parse-pipeline';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, IMPORT_PARSE_MAX, IMPORT_PARSE_WINDOW_SEC } from '@/lib/server/rate-limit';
import { logSafe } from '@/lib/logger';

/**
 * POST /api/imports/[batchId]/parse — runs the parse pipeline inline,
 * capped at the route's 60s maxDuration.
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
  | 'rate_limited'
  | 'pdf_not_found'
  | 'no_text_extracted'
  | 'service_unavailable'
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

  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .select('id, account_id, storage_path, status, accounts(institution)')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (batchErr) {
    logSafe('parse_route_load_error', { userId: user.id, error: batchErr.message });
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

  const allowParse = await checkRateLimit(
    supabase,
    user.id,
    'parse',
    IMPORT_PARSE_MAX,
    IMPORT_PARSE_WINDOW_SEC,
  );
  if (!allowParse) {
    return jsonError('rate_limited', 429);
  }

  await supabase
    .from('import_batches')
    .update({ status: 'parsing' })
    .eq('id', batch.id)
    .eq('user_id', user.id);

  const bankHint = (() => {
    const rel = batch.accounts as
      | { institution?: string | null }
      | { institution?: string | null }[]
      | null;
    if (!rel) return undefined;
    if (Array.isArray(rel)) return rel[0]?.institution ?? undefined;
    return rel.institution ?? undefined;
  })();

  try {
    const result = await runParsePipeline(supabase, {
      batchId: batch.id,
      userId: user.id,
      storagePath: batch.storage_path,
      bankHint,
    });
    return NextResponse.json({
      success: true,
      count: result.count,
      confidence: result.confidence,
      warnings: result.warnings,
    });
  } catch (err) {
    const isPipeline = err instanceof ParsePipelineError;
    const code = isPipeline ? err.code : 'parse_failed';
    const message = err instanceof Error ? err.message : 'unknown';
    logSafe('parse_route_error', {
      userId: user.id,
      batchId: batch.id,
      error: message,
      code,
    });

    await supabase
      .from('import_batches')
      .update({ status: 'failed', error_message: code })
      .eq('id', batch.id)
      .eq('user_id', user.id);

    if (code === 'service_unavailable') return jsonError('service_unavailable', 503);
    if (code === 'pdf_not_found') return jsonError('pdf_not_found', 404);
    return jsonError('parse_failed', 500);
  }
}
