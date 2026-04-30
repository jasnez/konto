'use client';

import { useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { reconcileCashAccount } from '@/app/(app)/racuni/actions';
import { MoneyInput } from '@/components/money-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatMinorUnits } from '@/lib/format/amount';

interface CashReconcileButtonProps {
  accountId: string;
  currency: string;
  currentBalanceCents: number;
}

export function CashReconcileButton({
  accountId,
  currency,
  currentBalanceCents,
}: CashReconcileButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualCents, setActualCents] = useState<bigint>(BigInt(currentBalanceCents));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setActualCents(BigInt(currentBalanceCents));
    }
  }, [open, currentBalanceCents]);

  const ledgerCents = BigInt(currentBalanceCents);
  const deltaCents = actualCents - ledgerCents;
  const isUnchanged = deltaCents === 0n;

  async function handleSubmit() {
    setSubmitting(true);
    const result = await reconcileCashAccount({
      account_id: accountId,
      actual_balance_cents: actualCents,
    });
    setSubmitting(false);

    if (result.success) {
      if (result.data.transactionId === null) {
        toast.message('Stanje je već usklađeno.');
      } else {
        toast.success('Stanje je usklađeno.');
      }
      setOpen(false);
      router.refresh();
      return;
    }

    if (result.error === 'CATEGORY_MISSING') {
      toast.error('Nedostaje sistemska kategorija.', {
        description: 'Otvori Postavke i obnovi početne kategorije.',
      });
      return;
    }
    if (result.error === 'NOT_CASH_ACCOUNT') {
      toast.error('Usklađivanje radi samo za gotovinske račune.');
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'EXTERNAL_SERVICE_ERROR') {
      toast.error('Tečaj nije dostupan. Pokušaj za minut.');
      return;
    }
    toast.error('Usklađivanje nije uspjelo. Pokušaj ponovo.');
  }

  const deltaLabel = (() => {
    if (isUnchanged) return 'Bez promjene';
    if (deltaCents < 0n) {
      return `Knjiži trošak ${formatMinorUnits(Number(-deltaCents), currency)}`;
    }
    return `Knjiži prihod ${formatMinorUnits(Number(deltaCents), currency)}`;
  })();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Scale className="mr-2 size-4" aria-hidden />
        Uskladi stanje
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Uskladi stanje gotovine</DialogTitle>
            <DialogDescription>
              Upiši koliko ti je gotovine trenutno u novčaniku — razlika će biti zabilježena kao
              jedna transakcija u kategoriji &quot;Gotovinski troškovi&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Po Konto evidenciji</span>
                <span className="font-medium tabular-nums">
                  {formatMinorUnits(currentBalanceCents, currency)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reconcile-actual">Stvarno u novčaniku</Label>
              <MoneyInput
                id="reconcile-actual"
                value={actualCents}
                onChange={setActualCents}
                currency={currency}
                size="lg"
                allowNegative={false}
              />
            </div>

            <p
              className={
                isUnchanged
                  ? 'text-sm text-muted-foreground'
                  : 'text-sm font-medium text-foreground'
              }
              aria-live="polite"
            >
              {deltaLabel}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
              disabled={submitting}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Spasi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
