'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { AddBudgetDialog } from '@/components/budgets/add-budget-dialog';
import { EditBudgetDialog } from '@/components/budgets/edit-budget-dialog';
import { BudgetCard } from '@/components/budgets/budget-card';
import { BudgetsEmptyState } from '@/components/budgets/empty-state';
import type { BudgetableCategory } from '@/components/budgets/budget-form';
import type { BudgetWithProgress } from '@/lib/queries/budgets';
import {
  deleteBudget,
  toggleBudgetActive,
  type DeleteBudgetResult,
  type ToggleBudgetActiveResult,
} from './actions';

/**
 * Client wrapper for /budzeti. Owns dialog open-state + per-card mutation
 * orchestration. The Server Component (page.tsx) does the data fetch and
 * passes serialized rows down (bigints → strings to cross the RSC boundary).
 */

export interface SerializedBudget {
  id: string;
  amountCents: string;
  spentCents: string;
  currency: string;
  period: 'monthly' | 'weekly';
  active: boolean;
  rollover: boolean;
  createdAt: string;
  updatedAt: string;
  progress: number;
  daysLeft: number;
  category: BudgetWithProgress['category'];
}

export interface BudgetsClientProps {
  initialBudgets: SerializedBudget[];
  categories: BudgetableCategory[];
  baseCurrency: string;
}

const TOGGLE_ERROR_COPY: Record<string, string> = {
  DUPLICATE_ACTIVE: 'Već postoji aktivan budžet za ovu kategoriju i period.',
  NOT_FOUND: 'Budžet više ne postoji. Osvježi stranicu.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Greška u bazi.',
};

const DELETE_ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Budžet više ne postoji.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Greška u bazi.',
};

export function BudgetsClient({ initialBudgets, categories, baseCurrency }: BudgetsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const budgets = useMemo<BudgetWithProgress[]>(
    () =>
      initialBudgets.map((b) => ({
        id: b.id,
        amountCents: BigInt(b.amountCents),
        spentCents: BigInt(b.spentCents),
        currency: b.currency,
        period: b.period,
        active: b.active,
        rollover: b.rollover,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        progress: b.progress,
        daysLeft: b.daysLeft,
        category: b.category,
      })),
    [initialBudgets],
  );

  const editingBudget = budgets.find((b) => b.id === editingId);

  function handleToggleActive(id: string, nextActive: boolean) {
    startTransition(async () => {
      const result: ToggleBudgetActiveResult = await toggleBudgetActive(id, {
        active: nextActive,
      });
      if (result.success) {
        toast.success(nextActive ? 'Budžet aktiviran.' : 'Budžet deaktiviran.');
        router.refresh();
        return;
      }
      if (result.error === 'VALIDATION_ERROR') {
        toast.error('Nevažeći zahtjev.');
        return;
      }
      toast.error(TOGGLE_ERROR_COPY[result.error] ?? 'Nepoznata greška.');
    });
  }

  async function handleDeleteConfirmed(id: string) {
    const result: DeleteBudgetResult = await deleteBudget(id);
    if (result.success) {
      toast.success('Budžet obrisan.');
      setDeletingId(null);
      router.refresh();
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      toast.error('Nevažeći zahtjev.');
      return;
    }
    toast.error(DELETE_ERROR_COPY[result.error] ?? 'Nepoznata greška.');
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Budžeti</h1>
          <p className="text-sm text-muted-foreground">Mjesečni i sedmični limiti po kategoriji.</p>
        </div>
        <Button
          onClick={() => {
            setAddOpen(true);
          }}
          disabled={categories.length === 0}
          size="lg"
          className="shrink-0"
        >
          <Plus className="mr-2 h-5 w-5" aria-hidden />
          Dodaj budžet
        </Button>
      </header>

      {budgets.length === 0 ? (
        <BudgetsEmptyState
          onCreate={() => {
            setAddOpen(true);
          }}
          hasCategories={categories.length > 0}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              onEdit={(id) => {
                setEditingId(id);
              }}
              onToggleActive={handleToggleActive}
              onDelete={(id) => {
                setDeletingId(id);
              }}
            />
          ))}
        </div>
      )}

      <AddBudgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        baseCurrency={baseCurrency}
      />

      {editingBudget && (
        <EditBudgetDialog
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          budget={{
            id: editingBudget.id,
            categoryId: editingBudget.category.id,
            amountCents: editingBudget.amountCents,
            currency: editingBudget.currency,
            period: editingBudget.period,
            rollover: editingBudget.rollover,
          }}
          categories={categories}
        />
      )}

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        title="Obrisati budžet?"
        description="Ova akcija je nepovratna. Transakcije ostaju netaknute, samo se briše limit."
        onConfirm={async () => {
          if (deletingId) await handleDeleteConfirmed(deletingId);
        }}
      />
    </>
  );
}
