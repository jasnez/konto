import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/format-money';
import { logSafe } from '@/lib/logger';
import { RecurringHistoryChart } from './recurring-history-chart';

export const metadata: Metadata = {
  title: 'Detalji pretplate — Konto',
};

interface RecurringRow {
  id: string;
  description: string;
  period: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';
  average_amount_cents: number;
  currency: string;
  next_expected_date: string | null;
  last_seen_date: string | null;
  paused_until: string | null;
  active: boolean;
  occurrences: number;
  detection_confidence: number | string | null;
  merchant_id: string | null;
  category_id: string | null;
  account_id: string | null;
  created_at: string;
}

interface HistoryTx {
  id: string;
  transaction_date: string;
  base_amount_cents: number;
  base_currency: string;
  original_amount_cents: number;
  original_currency: string;
  merchant_raw: string | null;
  description: string | null;
}

interface HistoryRpcPayload {
  recurring: RecurringRow | null;
  transactions: HistoryTx[];
}

const PERIOD_BADGE: Record<RecurringRow['period'], string> = {
  weekly: 'Sedmično',
  'bi-weekly': 'Dvosedmično',
  monthly: 'Mjesečno',
  quarterly: 'Kvartalno',
  yearly: 'Godišnje',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'd. MMM yyyy.', { locale: bs });
}

interface DetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PretplateDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const { data, error } = await supabase.rpc('get_recurring_with_history', {
    p_recurring_id: id,
  });
  if (error) {
    logSafe('pretplate_detail_rpc', { userId: user.id, error: error.message });
    notFound();
  }

  // The RPC returns jsonb { recurring: …, transactions: […] }. supabase-js
  // surfaces it as an unknown — narrow defensively.
  const payload = data as unknown as HistoryRpcPayload | null;
  if (!payload?.recurring) {
    notFound();
  }

  const r = payload.recurring;
  const txs = payload.transactions;
  const isPaused = r.paused_until ? parseISO(r.paused_until).getTime() > Date.now() : false;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Link
        href="/pretplate"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Sve pretplate
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">{r.description}</h1>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {PERIOD_BADGE[r.period]}
          </span>
          {isPaused && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              Pauzirano do {fmtDate(r.paused_until)}
            </span>
          )}
          {!r.active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Otkazano
            </span>
          )}
        </div>
        <div className="font-mono text-3xl font-semibold tabular-nums">
          {formatMoney(BigInt(r.average_amount_cents), r.currency, 'bs-BA', { showCurrency: true })}
        </div>
      </header>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">Atributi</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sljedeća</dt>
              <dd className="mt-0.5">{fmtDate(r.next_expected_date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Posljednja</dt>
              <dd className="mt-0.5">{fmtDate(r.last_seen_date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Broj pojava</dt>
              <dd className="mt-0.5">{String(r.occurrences)}</dd>
            </div>
            {r.detection_confidence !== null && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pouzdanost detektora
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums">
                  {Math.round(Number(r.detection_confidence) * 100)}%
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">Iznos kroz vrijeme</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          {txs.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Treba barem 2 transakcije za prikaz grafa.
            </p>
          ) : (
            <RecurringHistoryChart
              data={txs.map((t) => ({
                date: t.transaction_date,
                amountCents: Math.abs(t.base_amount_cents),
                currency: t.base_currency,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
          <CardTitle className="text-base">Vezane transakcije</CardTitle>
          <span className="text-xs text-muted-foreground">Posljednjih {String(txs.length)}</span>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {txs.length === 0 ? (
            <p className="px-4 pb-4 pt-0 text-sm text-muted-foreground sm:px-6 sm:pb-6">
              Još nema vezanih transakcija.
            </p>
          ) : (
            <ul className="divide-y">
              {txs.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/transakcije/${t.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {t.merchant_raw ?? t.description ?? r.description}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtDate(t.transaction_date)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(BigInt(t.base_amount_cents), t.base_currency, 'bs-BA', {
                        showCurrency: true,
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
