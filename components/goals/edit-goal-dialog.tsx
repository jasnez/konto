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
import { updateGoal, type UpdateGoalResult } from '@/app/(app)/ciljevi/actions';
import { GoalForm, type GoalAccount } from './goal-form';

/** Minimal goal shape needed by the dialog — avoids importing bigint types. */
export interface EditableGoal {
  id: string;
  name: string;
  /** Cents as string (serialized for RSC boundary). */
  targetAmountCents: string;
  currency: string;
  targetDate: string | null;
  accountId: string | null;
  icon: string | null;
  color: string | null;
}

export interface EditGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: EditableGoal;
  accounts: GoalAccount[];
}

const ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Cilj nije pronađen. Možda je obrisan.',
  ACCOUNT_NOT_FOUND: 'Odabrani račun nije pronađen.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj opet za par sekundi.',
};

export function EditGoalDialog({ open, onOpenChange, goal, accounts }: EditGoalDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi cilj</DialogTitle>
          <DialogDescription>Izmijeni detalje cilja štednje.</DialogDescription>
        </DialogHeader>

        <GoalForm
          mode="edit"
          accounts={accounts}
          defaultValues={{
            name: goal.name,
            target_amount_cents: goal.targetAmountCents,
            currency: goal.currency,
            target_date: goal.targetDate,
            account_id: goal.accountId,
            icon: goal.icon ?? undefined,
            color: goal.color ?? undefined,
          }}
          onSubmit={async (values) => {
            const result: UpdateGoalResult = await updateGoal(goal.id, {
              name: values.name,
              target_amount_cents: values.target_amount_cents,
              currency: values.currency,
              target_date: values.target_date,
              account_id: values.account_id,
              icon: values.icon,
              color: values.color,
            });
            if (result.success) {
              toast.success('Cilj ažuriran.');
              // GL-1: warn if balance sync failed — UI shows stale until refresh.
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
              const details = result.details as { _root?: string[] };
              const root = details._root;
              return root && root.length > 0 ? root[0] : 'Provjeri unos i pokušaj ponovo.';
            }
            return ERROR_COPY[result.error] ?? 'Nepoznata greška.';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
