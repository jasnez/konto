'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateBudget, type UpdateBudgetResult } from '@/app/(app)/budzeti/actions';
import { BudgetForm, type BudgetableCategory } from './budget-form';

export interface EditBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: {
    id: string;
    categoryId: string;
    amountCents: bigint;
    currency: string;
    period: 'monthly' | 'weekly';
    rollover: boolean;
  };
  categories: BudgetableCategory[];
}

const ERROR_COPY: Record<string, string> = {
  CATEGORY_NOT_BUDGETABLE: 'Kategorija mora biti tip troška ili štednje, i tvoja.',
  DUPLICATE_ACTIVE: 'Već postoji aktivan budžet za ovu kategoriju i period.',
  NOT_FOUND: 'Budžet više ne postoji. Osvježi stranicu.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
  // BG-1: server rejects period change without explicit new amount.
  // 1000 KM/mjesec ≠ 1000 KM/sedmicu — auto-scaling bi tiho promijenio
  // baseline po kojem se mjeri potrošnja. Korisnik mora unijeti novi
  // iznos eksplicitno.
  PERIOD_CHANGE_REQUIRES_AMOUNT:
    'Promjena perioda traži i novi iznos limita. Tjedni i mjesečni budžet imaju različite skale.',
};

export function EditBudgetDialog({
  open,
  onOpenChange,
  budget,
  categories,
}: EditBudgetDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi budžet</DialogTitle>
          <DialogDescription>Promijeni iznos, period ili rollover.</DialogDescription>
        </DialogHeader>
        <BudgetForm
          mode="edit"
          categories={categories}
          baseCurrency={budget.currency}
          defaultValues={{
            category_id: budget.categoryId,
            amount_cents: budget.amountCents.toString(),
            currency: budget.currency,
            period: budget.period,
            rollover: budget.rollover,
          }}
          onSubmit={async (values) => {
            const result: UpdateBudgetResult = await updateBudget(budget.id, {
              // category_id is locked in edit mode but Server schema accepts
              // it; pass the unchanged id so RLS WITH CHECK still validates.
              category_id: values.category_id,
              amount_cents: values.amount_cents,
              currency: values.currency,
              period: values.period,
              rollover: values.rollover,
            });
            if (result.success) {
              toast.success('Budžet ažuriran.');
              onOpenChange(false);
              router.refresh();
              return null;
            }
            if (result.error === 'VALIDATION_ERROR') {
              const details = result.details;
              if ('_root' in details && Array.isArray(details._root) && details._root.length > 0) {
                return details._root[0] ?? 'Provjeri unos i pokušaj ponovo.';
              }
              return 'Provjeri unos i pokušaj ponovo.';
            }
            return ERROR_COPY[result.error] ?? 'Nepoznata greška.';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
