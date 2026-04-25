import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AccountOption } from '@/components/account-select';
import { ImportBatchesTable } from './import-batches-table';
import { ImportStatementClient } from './import-client';
import type { ImportListRow, ImportStatus } from './types';

export const metadata: Metadata = {
  title: 'Uvezi izvod — Konto',
};

export const maxDuration = 60;

function isImportStatus(s: string): s is ImportStatus {
  return s === 'uploaded' || s === 'parsing' || s === 'ready' || s === 'imported' || s === 'failed';
}

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [{ data: accountRows, error: accountsError }, { data: batchRows, error: batchError }] =
    await Promise.all([
      supabase
        .from('accounts')
        .select('id,name,currency')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('import_batches')
        .select('id, created_at, status, account_id, accounts ( institution, name, currency )')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  if (accountsError) {
    console.error('import_page_accounts', { userId: user.id, error: accountsError.message });
  }

  if (batchError) {
    console.error('import_page_batches', { userId: user.id, error: batchError.message });
  }

  const accountOptions: AccountOption[] = (accountRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  const batches = (batchRows ?? []) as {
    id: string;
    created_at: string;
    status: string;
    account_id: string | null;
    accounts: { institution: string | null; name: string; currency: string } | null;
  }[];

  const batchIds = batches.map((b) => b.id);
  const countById = new Map<string, number>();
  for (const id of batchIds) countById.set(id, 0);

  if (batchIds.length > 0) {
    const { data: countRows, error: countErr } = await supabase
      .from('transactions')
      .select('import_batch_id')
      .in('import_batch_id', batchIds)
      .is('deleted_at', null);

    if (countErr) {
      console.error('import_page_tx_count', { userId: user.id, error: countErr.message });
    } else {
      for (const row of countRows) {
        const bid = row.import_batch_id;
        if (!bid) continue;
        countById.set(bid, (countById.get(bid) ?? 0) + 1);
      }
    }
  }

  const listRows: ImportListRow[] = batches.map((b) => {
    const a = b.accounts;
    const bank: string = (() => {
      if (!a) return '—';
      const inst = a.institution?.trim() ?? '';
      return inst.length > 0 ? inst : a.name;
    })();
    const st = b.status;
    if (!isImportStatus(st)) {
      return {
        id: b.id,
        createdAt: b.created_at,
        bankLabel: bank,
        status: 'uploaded',
        transactionCount: countById.get(b.id) ?? 0,
      };
    }
    return {
      id: b.id,
      createdAt: b.created_at,
      bankLabel: bank,
      status: st,
      transactionCount: countById.get(b.id) ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:px-6">
      <div className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Uvezi izvod</h1>
          <p className="text-base text-muted-foreground">
            Odaberi račun, zatim prevuci bankarski PDF ili ga izaberi s uređaja.
          </p>
        </div>
        <p>
          <Link
            href="/help#uvoz-pdf"
            className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline"
            title="Kratko u Pomoći: koraci, podrška banaka, učenje kategorija."
          >
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
            Kako funkcioniše uvoz?
          </Link>
        </p>
      </div>

      <ImportStatementClient accounts={accountOptions} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Prethodni uvozi</h2>
        <ImportBatchesTable rows={listRows} />
      </div>
    </div>
  );
}
