import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface PageProps {
  params: Promise<{ batchId: string }>;
}

export const metadata: Metadata = {
  title: 'Pregled uvoza — Konto',
};

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
      'id, status, original_filename, created_at, account_id, accounts ( institution, name, currency )',
    )
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('import_batch_detail', { userId: user.id, error: error.message });
    notFound();
  }
  if (!batch) notFound();

  const a = batch.accounts;
  const bank: string = (() => {
    if (!a) return '—';
    const inst = a.institution?.trim() ?? '';
    return inst.length > 0 ? inst : a.name;
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <p className="text-sm text-muted-foreground">
        <Link className="text-primary hover:underline" href="/import">
          ← Natrag na uvoz
        </Link>
      </p>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Pregled uvoza</h1>
        <p className="text-sm text-muted-foreground">
          Tok obrade i uvođenje transakcija dolaze u narednom koraku. Za sada vidi osnovne podatke
          fajla.
        </p>
      </div>
      <div className="space-y-1 rounded-lg border border-border/80 bg-card p-4 text-base">
        <p>
          <span className="text-muted-foreground">Fajl: </span>
          {batch.original_filename}
        </p>
        <p>
          <span className="text-muted-foreground">Banka (račun): </span>
          {bank}
        </p>
        <p>
          <span className="text-muted-foreground">Status: </span>
          {batch.status}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="h-12 min-h-12 w-full sm:w-auto">
          <Link href="/import">Novi PDF</Link>
        </Button>
        <Button asChild variant="outline" className="h-12 min-h-12 w-full sm:w-auto">
          <Link href="/transakcije">Otvori transakcije</Link>
        </Button>
      </div>
    </div>
  );
}
