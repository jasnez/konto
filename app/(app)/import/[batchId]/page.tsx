import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ImportBatchLifecycle } from '../import-batch-lifecycle';
import {
  ImportReviewClient,
  type ReviewCategoryOption,
  type ReviewParsedRow,
} from '../import-review-client';

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

function parseWarningsJson(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function narrowConfidence(raw: string | null): ConfidenceLevel {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return null;
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
    console.error('import_batch_detail', { userId: user.id, error: error.message });
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

  if (batchStatus === 'failed') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:max-w-5xl md:px-6">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary hover:underline" href="/import">
            ← Natrag na uvoz
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-base text-foreground">
          <p className="font-medium">Obrada izvoda nije uspjela.</p>
          {batch.error_message ? (
            <p className="mt-2 text-sm text-muted-foreground">{batch.error_message}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const [{ data: parsedRows, error: parsedErr }, { data: categoryRows, error: catErr }] =
    await Promise.all([
      supabase
        .from('parsed_transactions')
        .select(
          'id, transaction_date, raw_description, amount_minor, currency, category_id, merchant_id, selected_for_import, parse_confidence, status',
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
    console.error('import_batch_parsed', { userId: user.id, error: parsedErr.message });
    notFound();
  }
  if (catErr) {
    console.error('import_batch_categories', { userId: user.id, error: catErr.message });
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
  }));

  const showReview = batchStatus === 'ready';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <ImportBatchLifecycle batchId={batch.id} status={batchStatus} />
      <p className="text-sm text-muted-foreground">
        <Link className="text-primary hover:underline" href="/import">
          ← Natrag na uvoz
        </Link>
      </p>

      <header className="mt-4 space-y-1 border-b border-border/60 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
        {!showReview ? (
          <p className="text-base text-muted-foreground">
            {batchStatus === 'uploaded'
              ? 'Priprema i obrada PDF-a…'
              : 'AI parsira transakcije iz izvoda. Ovo može potrajati nekoliko sekundi.'}
          </p>
        ) : null}
      </header>

      {showReview ? (
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
      ) : (
        <div className="mt-8 flex min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-12 text-center">
          <p className="text-base text-muted-foreground">
            {batchStatus === 'uploaded' ? 'Pokrećem obradu…' : 'Molimo pričekaj…'}
          </p>
        </div>
      )}
    </div>
  );
}
