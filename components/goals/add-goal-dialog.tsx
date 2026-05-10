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
import { createGoal, type CreateGoalResult } from '@/app/(app)/ciljevi/actions';
import { GoalForm, type GoalAccount } from './goal-form';

export interface AddGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: GoalAccount[];
  baseCurrency: string;
}

const ERROR_COPY: Record<string, string> = {
  ACCOUNT_NOT_FOUND: 'Odabrani račun nije pronađen. Odaberi drugi račun.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};

export function AddGoalDialog({ open, onOpenChange, accounts, baseCurrency }: AddGoalDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novi cilj štednje</DialogTitle>
          <DialogDescription>
            Postavi cilj i prati koliko si skupio. Možeš vezati štedni račun za automatski napredak.
          </DialogDescription>
        </DialogHeader>

        <GoalForm
          mode="create"
          accounts={accounts}
          baseCurrency={baseCurrency}
          onSubmit={async (values) => {
            const result: CreateGoalResult = await createGoal(values);
            if (result.success) {
              toast.success('Cilj kreiran.');
              // GL-1: warn if balance sync failed — UI shows zero until refresh.
              if (result.recomputeFailed) {
                toast.warning(
                  'Balans cilja se nije sinhronizovao. Osvježi stranicu za par sekundi.',
                );
              }
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
