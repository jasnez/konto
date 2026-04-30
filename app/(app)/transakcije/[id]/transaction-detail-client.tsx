'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ArrowLeft, GitBranchPlus, ImageIcon, Pencil, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSignedReceiptUrl } from '@/app/(app)/skeniraj/actions';
import { deleteTransaction, updateTransaction } from '@/app/(app)/transakcije/actions';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Money } from '@/components/money';
import { formatMoney } from '@/lib/format/format-money';

interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
}

interface TransactionDetailView {
  id: string;
  transaction_date: string;
  original_amount_cents: number;
  original_currency: string;
  base_amount_cents: number;
  base_currency: string;
  fx_rate: number | null;
  fx_rate_date: string | null;
  merchant_raw: string | null;
  description: string | null;
  notes: string | null;
  source: string;
  is_transfer: boolean;
  tags: string[] | null;
  receipt_scan_id: string | null;
  created_at: string;
  updated_at: string;
  account: { id: string; name: string; currency: string } | null;
  category: { id: string; name: string; icon: string | null } | null;
}

interface TransactionDetailClientProps {
  tx: TransactionDetailView;
  categories: CategoryOption[];
}

function formatDateLabel(isoDate: string): string {
  return format(new Date(isoDate), 'd. MMMM yyyy.', { locale: bs });
}

function formatDateTimeLabel(isoDateTime: string): string {
  return format(new Date(isoDateTime), 'd. MMM yyyy. u HH:mm', { locale: bs });
}

function toSearchShortcut(value: string | null): string {
  if (!value) return '/transakcije';
  return `/transakcije?search=${encodeURIComponent(value)}`;
}

export function TransactionDetailClient({ tx, categories }: TransactionDetailClientProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busyCategory, setBusyCategory] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState<string | null>(tx.category?.id ?? null);
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = React.useState(false);

  React.useEffect(() => {
    const state = { cancelled: false };
    const scanId = tx.receipt_scan_id;
    if (!scanId) {
      setReceiptUrl(null);
      return () => {
        state.cancelled = true;
      };
    }
    setReceiptLoading(true);
    void (async () => {
      const result = await getSignedReceiptUrl(scanId, 300);
      if (state.cancelled) return;
      setReceiptLoading(false);
      if (result.success) setReceiptUrl(result.data.url);
    })();
    return () => {
      state.cancelled = true;
    };
  }, [tx.receipt_scan_id]);

  async function handleCategoryChange(nextCategoryId: string | null) {
    setCategoryId(nextCategoryId);
    setBusyCategory(true);
    const result = await updateTransaction(tx.id, { category_id: nextCategoryId });
    setBusyCategory(false);

    if (result.success) {
      toast.success('Kategorija je sačuvana.');
      router.refresh();
      return;
    }

    toast.error('Ne mogu sačuvati kategoriju.');
    setCategoryId(tx.category?.id ?? null);
  }

  async function handleDelete() {
    const result = await deleteTransaction(tx.id);

    if (result.success) {
      setDeleteOpen(false);
      toast.success('Transakcija je obrisana.');
      router.push('/transakcije');
      router.refresh();
      return;
    }

    toast.error('Brisanje nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  const originalAmount = formatMoney(
    BigInt(tx.original_amount_cents),
    tx.original_currency,
    'bs-BA',
  );
  const baseAmount = formatMoney(BigInt(tx.base_amount_cents), tx.base_currency, 'bs-BA');
  const merchantName = tx.merchant_raw ?? tx.description ?? 'Transakcija';
  const hasFxDetails =
    tx.fx_rate !== null &&
    (tx.original_currency !== tx.base_currency ||
      tx.original_amount_cents !== tx.base_amount_cents);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
      <Button asChild variant="ghost" className="-ml-2 h-11 px-2 text-muted-foreground">
        <Link href="/transakcije" className="inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Nazad na transakcije
        </Link>
      </Button>

      <section className="rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">{formatDateLabel(tx.transaction_date)}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          <Money
            cents={BigInt(tx.original_amount_cents)}
            currency={tx.original_currency}
            tone="default"
          />
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{merchantName}</p>
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-medium">Detalji</h2>

        <DetailRow label="Račun" value={tx.account?.name ?? '—'} />

        <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
          <p className="text-sm text-muted-foreground">Kategorija</p>
          <Select
            value={categoryId ?? '__none__'}
            onValueChange={(value) => {
              void handleCategoryChange(value === '__none__' ? null : value);
            }}
            disabled={busyCategory}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Bez kategorije</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.icon ?? '📦'} {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DetailRow
          label="Tagovi"
          value={tx.tags && tx.tags.length > 0 ? tx.tags.join(', ') : '—'}
        />
        <DetailRow label="Napomena" value={tx.notes ?? '—'} />

        {tx.original_currency !== tx.base_currency ? (
          <DetailRow label="Originalni iznos" value={`${originalAmount} (base: ${baseAmount})`} />
        ) : null}

        {hasFxDetails ? (
          <DetailRow
            label="FX kurs"
            value={`${tx.fx_rate?.toFixed(6) ?? '—'} (${tx.fx_rate_date ?? 'bez datuma'})`}
          />
        ) : null}

        <DetailRow label="Source" value={tx.source} />
        <DetailRow label="Kreirano" value={formatDateTimeLabel(tx.created_at)} />
        <DetailRow label="Zadnji edit" value={formatDateTimeLabel(tx.updated_at)} />
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-medium">Akcije</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/transakcije/${tx.id}/uredi`}>
              <Pencil className="h-4 w-4" />
              Uredi
            </Link>
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled>
            <GitBranchPlus className="h-4 w-4" />
            Split (Faza 3+)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              toast.message('Mark as transfer dolazi u Fazi 3+.');
            }}
          >
            <Repeat className="h-4 w-4" />
            Mark as transfer
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Obriši
          </Button>
        </div>
      </section>

      {tx.receipt_scan_id ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <ImageIcon className="size-5" aria-hidden />
            Skenirani račun
          </h2>
          {receiptLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Učitavanje…</p>
          ) : receiptUrl ? (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt="Slika fiskalnog računa"
                className="mx-auto max-h-96 w-full object-contain"
              />
            </a>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Slika računa nije dostupna.</p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-medium">Povezano</h2>
        <Button asChild variant="link" className="mt-2 h-auto px-0 text-left">
          <Link href={toSearchShortcut(tx.merchant_raw)}>Sve transakcije sa ovim merchant-om</Link>
        </Button>
      </section>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Obrisati transakciju?"
        description="Ova akcija radi soft delete. Možeš je kasnije vratiti kroz restore."
        onConfirm={handleDelete}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
