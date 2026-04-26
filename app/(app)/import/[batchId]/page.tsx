import type { Metadata } from 'next';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ImportBatchAwaitParse } from '../import-batch-await-parse';
import { ImportBatchEmptyClient } from '../import-batch-empty-client';
import { ImportBatchFailedClient } from '../import-batch-failed-client';
import {
  ImportReviewClient,
  type ReviewCategoryOption,
  type ReviewParsedRow,
} from '../import-review-client';
import { logSafe } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface PageProps {
  params: Promise<{ batchId: string }>;
}

export const metadata: Metadata = {
  title: 'Pregled uvoza — Konto',
};

export const maxDuration = 60;

type ConfidenceLevel = 'high' | 'medium' | 'low' | null;
type BatchStatus = 'uploaded' | 'parsing' | 'ready' | 'imported' | 'failed' | 'rejected';
type CategorizationSource =
  | 'rule'
  | 'alias_exact'
  | 'alias_fuzzy'
  | 'history'
  | 'llm'
  | 'none'
  | 'user';

function parseWarningsJson(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function narrowConfidence(raw: string | null): ConfidenceLevel {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return null;
}

function narrowCategorizationSource(raw: string | null): CategorizationSource {
  if (
    raw === 'rule' ||
    raw === 'alias_exact' ||
    raw === 'alias_fuzzy' ||
    raw === 'history' ||
    raw === 'llm' ||
    raw === 'none' ||
    raw === 'user'
  ) {
    return raw;
  }
  return 'none';
}

function narrowStatus(raw: string): BatchStatus {
  if (
    raw === 'uploaded' ||
    raw === 'parsing' ||
    raw === 'ready' ||
    raw === 'imported' ||
    raw === 'failed' ||
    raw === 'rejected'
  ) {
    return raw;
  }
  return 'failed';
}

function formatStatementPeriodLabel(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  try {
    const a = start ? format(parseISO(start), 'd. MMM yyyy.', { locale: bs }) : '…';
    const b = end ? format(parseISO(end), 'd. MMM yyyy.', { locale: bs }) : '…';
    return `${a} – ${b}`;
  } catch {
    return '—';
  }
}

export default async function ImportBatchPage(props: PageProps) {
  const { batchId } = await props.params;
  if (!UUID_RE.test(batchId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const { data: batch, error } = await supabase
    .from('import_batches')
    .select(
      'id, status, original_filename, account_id, parse_confidence, parse_warnings, statement_period_start, statement_period_end, error_message, accounts ( institution, name, currency )',
    )
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    logSafe('import_batch_detail', { userId: user.id, error: error.message });
    notFound();
  }
  if (!batch) notFound();

  const batchStatus: BatchStatus = narrowStatus(batch.status);

  if (batchStatus === 'imported') {
    redirect('/transakcije');
  }
  if (batchStatus === 'rejected') {
    redirect('/import');
  }

  const a = batch.accounts;
  const bankLabel: string = (() => {
    if (!a) return '—';
    const inst = a.institution?.trim() ?? '';
    return inst.length > 0 ? inst : a.name;
  })();

  const warnings = parseWarningsJson(batch.parse_warnings);
  const periodLabel = formatStatementPeriodLabel(
    batch.statement_period_start,
    batch.statement_period_end,
  );

  if (batchStatus === 'failed') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary hover:underline" href="/import">
            ← Natrag na uvoz
          </Link>
        </p>
        <header className="mt-4 space-y-1 border-b border-border/60 pb-6">
          <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{bankLabel}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span>{batch.original_filename}</span>
          </p>
        </header>
        <ImportBatchFailedClient batchId={batch.id} errorMessageRaw={batch.error_message} />
      </div>
    );
  }

  if (batchStatus === 'uploaded' || batchStatus === 'parsing') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary hover:underline" href="/import">
            ← Natrag na uvoz
          </Link>
        </p>
        <header className="mt-4 space-y-1 border-b border-border/60 pb-6">
          <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
        </header>
        <ImportBatchAwaitParse batchId={batch.id} status={batchStatus} />
      </div>
    );
  }

  const [{ data: parsedRows, error: parsedErr }, { data: categoryRows, error: catErr }] =
    await Promise.all([
      supabase
        .from('parsed_transactions')
        .select(
          'id, transaction_date, raw_description, amount_minor, currency, category_id, merchant_id, selected_for_import, parse_confidence, categorization_source, categorization_confidence, status',
        )
        .eq('batch_id', batchId)
        .eq('user_id', user.id)
        .eq('status', 'pending_review')
        .order('transaction_date', { ascending: false }),
      supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);

  if (parsedErr) {
    logSafe('import_batch_parsed', { userId: user.id, error: parsedErr.message });
    notFound();
  }
  if (catErr) {
    logSafe('import_batch_categories', { userId: user.id, error: catErr.message });
    notFound();
  }

  const categories: ReviewCategoryOption[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const initialRows: ReviewParsedRow[] = parsedRows.map((r) => ({
    id: r.id,
    transaction_date: r.transaction_date,
    raw_description: r.raw_description,
    amount_minor: r.amount_minor,
    currency: r.currency,
    category_id: r.category_id,
    merchant_id: r.merchant_id,
    selected_for_import: r.selected_for_import,
    parse_confidence: narrowConfidence(r.parse_confidence),
    categorization_source: narrowCategorizationSource(r.categorization_source),
    categorization_confidence: r.categorization_confidence ?? 0,
  }));

  if (initialRows.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary hover:underline" href="/import">
            ← Natrag na uvoz
          </Link>
        </p>
        <header className="mt-4 space-y-1 border-b border-border/60 pb-6">
          <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{bankLabel}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span>{batch.original_filename}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Period izvoda: <span className="text-foreground">{periodLabel}</span>
          </p>
        </header>
        <ImportBatchEmptyClient />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <p className="text-sm text-muted-foreground">
        <Link className="text-primary hover:underline" href="/import">
          ← Natrag na uvoz
        </Link>
      </p>

      <header className="mt-4 space-y-1 border-b border-border/60 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
      </header>

      <div className="mt-6">
        <ImportReviewClient
          batchId={batch.id}
          initialRows={initialRows}
          categories={categories}
          batch={{
            bankLabel,
            fileName: batch.original_filename,
            parseConfidence: narrowConfidence(batch.parse_confidence),
            parseWarnings: warnings,
            periodStart: batch.statement_period_start,
            periodEnd: batch.statement_period_end,
          }}
        />
      </div>
    </div>
  );
}
