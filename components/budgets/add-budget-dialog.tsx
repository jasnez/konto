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
import { createBudget, type CreateBudgetResult } from '@/app/(app)/budzeti/actions';
import { BudgetForm, type BudgetableCategory } from './budget-form';

export interface AddBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: BudgetableCategory[];
  baseCurrency: string;
}

const ERROR_COPY: Record<string, string> = {
  CATEGORY_NOT_BUDGETABLE: 'Kategorija mora biti tip troška ili štednje, i tvoja.',
  DUPLICATE_ACTIVE:
    'Već imaš aktivan budžet za ovu kategoriju i period. Deaktiviraj prvo postojeći.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj opet za par sekundi.',
};

export function AddBudgetDialog({
  open,
  onOpenChange,
  categories,
  baseCurrency,
}: AddBudgetDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj budžet</DialogTitle>
          <DialogDescription>
            Postavi mjesečni ili sedmični limit za jednu kategoriju.
          </DialogDescription>
        </DialogHeader>
        <BudgetForm
          mode="create"
          categories={categories}
          baseCurrency={baseCurrency}
          onSubmit={async (values) => {
            const result: CreateBudgetResult = await createBudget(values);
            if (result.success) {
              toast.success('Budžet kreiran.');
              onOpenChange(false);
              router.refresh();
              return null;
            }
            if (result.error === 'VALIDATION_ERROR') {
              const root = result.details._root;
              return root.length > 0 ? root[0] : 'Provjeri unos i pokušaj ponovo.';
            }
            return ERROR_COPY[result.error] ?? 'Nepoznata greška.';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
